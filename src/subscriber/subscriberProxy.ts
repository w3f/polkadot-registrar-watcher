import { Logger } from "@w3f/logger";
import { InputConfig } from "../types";
import { Subscriber } from "./subscriber";
import { IU8a } from '@polkadot/types-codec/types';

export class SubscriberProxy extends Subscriber {

  private registrarPrimaryAccount: string;

  constructor(
    cfg: InputConfig,
    protected readonly logger: Logger) {
      super(cfg,logger)
      this.logger.info('proxy functionality activated')
      this.registrarPrimaryAccount = cfg.registrar.proxy.primaryAccount
    }

  protected _triggerExtrinsicProvideJudgement = async (target: string, judgement: {Reasonable: boolean} | {Erroneous: boolean}, identityHash: IU8a ): Promise<void> =>{     
    
    const call = this.api.tx.identity.provideJudgement(this.registrarIndex,target,judgement,identityHash)
    const extrinsic = this.api.tx.proxy.proxy(this.registrarPrimaryAccount, null, call)
    const txHash = await extrinsic.signAndSend(this.registrarAccount)
    this.logger.info(`Judgement Submitted with hash ${txHash}`);

  }

}