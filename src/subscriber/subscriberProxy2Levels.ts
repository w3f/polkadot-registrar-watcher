import { Logger } from "@w3f/logger";
import { InputConfig } from "../types";
import { Subscriber } from "./subscriber";
import { IU8a } from '@polkadot/types-codec/types';

export class SubscriberProxy2Levels extends Subscriber {

  private registrarPrimaryAccount: string;
  private registrarMiddleAccount: string

  constructor(
    cfg: InputConfig,
    protected readonly logger: Logger) {
      super(cfg,logger)
      this.logger.info('proxy (2 Levels) functionality activated')
      this.registrarMiddleAccount = cfg.registrar.proxy2Levels.middleAccount
      this.registrarPrimaryAccount = cfg.registrar.proxy2Levels.primaryAccount
    }

  protected _triggerExtrinsicProvideJudgement = async (target: string, judgement: {Reasonable: boolean} | {Erroneous: boolean}, identityHash: IU8a ): Promise<void> =>{     
    
    const call = this.api.tx.identity.provideJudgement(this.registrarIndex,target,judgement,identityHash)
    const callMidlle = this.api.tx.proxy.proxy(this.registrarPrimaryAccount, null, call)
    const extrinsic = this.api.tx.proxy.proxy(this.registrarMiddleAccount, null, callMidlle)
    const txHash = await extrinsic.signAndSend(this.registrarAccount)
    this.logger.info(`Judgement Submitted with hash ${txHash}`);

  }

}