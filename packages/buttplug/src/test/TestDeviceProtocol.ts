/*!
 * Buttplug JS Source Code File - Visit https://buttplug.io for more info about
 * the project. Licensed under the BSD 3-Clause license. See LICENSE file in the
 * project root for full license information.
 *
 * @copyright Copyright (c) Nonpolynomial Labs LLC. All rights reserved.
 */

import { SingleMotorVibrateCmd, FleshlightLaunchFW12Cmd } from "../index";
import * as Messages from "../index";
import { ButtplugDeviceProtocol } from "../devices/ButtplugDeviceProtocol";
import { IButtplugDeviceImpl } from "../devices/IButtplugDeviceImpl";
import { TestDeviceImpl } from "./TestDeviceImpl";
import { ButtplugDeviceException } from "../core/Exceptions";

export class TestDeviceProtocol extends ButtplugDeviceProtocol {

  private _linearSpeed: number = 0;
  private _linearPosition: number = 0;
  private _vibrateSpeed: number = 0;
  private _rotateSpeed: number = 0;
  private _rotateClockwise: boolean = false;
  private _shouldVibrate = false;
  private _shouldRotate = false;
  private _shouldLinear = false;

  public constructor(name: string,
                     deviceImpl: IButtplugDeviceImpl,
                     aShouldVibrate: boolean,
                     aShouldLinear: boolean,
                     aShouldRotate: boolean) {
    super(`Test Device - ${name}`, deviceImpl);
    this._shouldVibrate = aShouldVibrate;
    this._shouldLinear = aShouldLinear;
    this._shouldRotate = aShouldRotate;

    this.MsgFuncs.set(Messages.StopDeviceCmd, this.HandleStopDeviceCmd);

    if (!(deviceImpl instanceof TestDeviceImpl)) {
      throw new ButtplugDeviceException("TestDeviceProtocol can only be constructed with a TestDeviceImpl");
    }

    // This sort of mimics how we decide on features via BLE names.
    if (this._shouldVibrate) {
      this.MsgFuncs.set(Messages.SingleMotorVibrateCmd, this.HandleSingleMotorVibrateCmd);
      this.MsgFuncs.set(Messages.VibrateCmd, this.HandleVibrateCmd);
    }
    if (this._shouldLinear) {
      this.MsgFuncs.set(Messages.FleshlightLaunchFW12Cmd, this.HandleFleshlightLaunchFW12Cmd);
      this.MsgFuncs.set(Messages.LinearCmd, this.HandleLinearCmd);
    }
    if (this._shouldRotate) {
      this.MsgFuncs.set(Messages.RotateCmd, this.HandleRotateCmd);
    }
  }

  public get MessageSpecifications(): object {
    if (this.MsgFuncs.has(Messages.VibrateCmd)) {
      return {
        VibrateCmd: { FeatureCount: 2 },
        SingleMotorVibrateCmd: {},
        StopDeviceCmd: {},
      };
    } else if (this.MsgFuncs.has(Messages.LinearCmd)) {
      return {
        LinearCmd: { FeatureCount: 1 },
        FleshlightLaunchFW12Cmd: {},
        StopDeviceCmd: {},
      };
    } else if (this.MsgFuncs.has(Messages.RotateCmd)) {
      return {
        RotateCmd: { FeatureCount: 1 },
        StopDeviceCmd: {},
      };
    }
    return {};
  }

  private HandleStopDeviceCmd = async (aMsg: Messages.StopDeviceCmd): Promise<Messages.ButtplugMessage> => {
    if (this.MsgFuncs.has(Messages.VibrateCmd)) {
      this.emit("vibrate", 0);
    } else if (this.MsgFuncs.has(Messages.LinearCmd)) {
      this.emit("linear", { position: this._linearPosition,
                            speed: this._linearSpeed});
    }
    return Promise.resolve(new Messages.Ok(aMsg.Id));
  }

  private HandleSingleMotorVibrateCmd =
    async (aMsg: Messages.SingleMotorVibrateCmd): Promise<Messages.ButtplugMessage> => {
      this._vibrateSpeed = aMsg.Speed;
      this.emit("vibrate", aMsg.Speed);
      return Promise.resolve(new Messages.Ok(aMsg.Id));
    }

  private HandleVibrateCmd =
    async (aMsg: Messages.VibrateCmd): Promise<Messages.ButtplugMessage> => {
      return this.HandleSingleMotorVibrateCmd(new SingleMotorVibrateCmd(aMsg.Speeds[0].Speed,
                                                                        aMsg.DeviceIndex,
                                                                        aMsg.Id));
    }

  private HandleRotateCmd =
    async (aMsg: Messages.RotateCmd): Promise<Messages.ButtplugMessage> => {
      this._rotateSpeed = aMsg.Rotations[0].Speed;
      this._rotateClockwise = aMsg.Rotations[0].Clockwise;
      this.emit("vibrate", { speed: this._rotateSpeed,
                             clockwise: this._rotateClockwise });
      return Promise.resolve(new Messages.Ok(aMsg.Id));
    }

  private HandleFleshlightLaunchFW12Cmd =
    async (aMsg: Messages.FleshlightLaunchFW12Cmd): Promise<Messages.ButtplugMessage> => {
      this._linearPosition = aMsg.Position;
      this._linearSpeed = aMsg.Speed;
      this.emit("linear", { position: this._linearPosition,
                            speed: this._linearSpeed });
      return Promise.resolve(new Messages.Ok(aMsg.Id));
    }

  private HandleLinearCmd =
    async (aMsg: Messages.LinearCmd): Promise<Messages.ButtplugMessage> => {
      if (aMsg.Vectors.length !== 1) {
        return new Messages.Error("LinearCmd requires 1 vector for this device.",
                                  Messages.ErrorClass.ERROR_DEVICE,
                                  aMsg.Id);
      }
      // Move between 5/95, otherwise we'll allow the device to smack into hard
      // stops because of braindead firmware.
      const range: number = 90;
      const vector = aMsg.Vectors[0];
      const currentPosition = vector.Position * 100;
      const positionDelta: number = Math.abs(currentPosition - this._linearPosition);
      let speed: number = Math.floor(25000 * Math.pow(((vector.Duration * 90) / positionDelta), -1.05));

      // Clamp speed on 0 <= x <= 95 so we don't break the launch.
      speed = Math.min(Math.max(speed, 0), 95);

      const positionGoal = Math.floor(((currentPosition / 99) * range) + ((99 - range) / 2));
      // We'll set this._lastPosition in FleshlightLaunchFW12Cmd, since
      // everything kinda funnels to that.
      return await this.HandleFleshlightLaunchFW12Cmd(new Messages.FleshlightLaunchFW12Cmd(speed,
                                                                                           positionGoal,
                                                                                           aMsg.DeviceIndex,
                                                                                           aMsg.Id));
    }
}
