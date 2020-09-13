import { ApiPromise, WsProvider } from '@polkadot/api';
import { SessionIndex } from '@polkadot/types/interfaces';
import { Logger } from '@w3f/logger';
import { Text } from '@polkadot/types/primitive';

import {
    InputConfig
} from './types';

export class Subscriber {
    private chain: Text;
    private api: ApiPromise;
    private endpoint: string;
    private sessionIndex: SessionIndex;
    private logLevel: string;

    constructor(
        cfg: InputConfig,
        private readonly logger: Logger) {
        this.endpoint = cfg.endpoint;
    }

    public async start(): Promise<void> {
        await this._initAPI();
        await this._initInstanceVariables();

        if(this.logLevel === 'debug') await this._triggerDebugActions()

        await this._handleNewHeadSubscriptions();
    }

    private async _initAPI(): Promise<void> {
        const provider = new WsProvider(this.endpoint);
        this.api = await ApiPromise.create({ provider });
        
        this.chain = await this.api.rpc.system.chain();
        const [nodeName, nodeVersion] = await Promise.all([
            this.api.rpc.system.name(),
            this.api.rpc.system.version()
        ]);
        this.logger.info(
            `You are connected to chain ${this.chain} using ${nodeName} v${nodeVersion}`
        );
    }

    private async _initInstanceVariables(): Promise<void>{
      this.sessionIndex = await this.api.query.session.currentIndex();
      this.logger.info(
        `Session index: ${this.sessionIndex}`
      );
    }

    private async _handleNewHeadSubscriptions(): Promise<void> {

      this.api.rpc.chain.subscribeNewHeads(async (header) => {
        this.logger.info(
          `New header received: ${header}`
        );
        //Here there will be the handler
      })
    }

    private async _triggerDebugActions(): Promise<void>{
      this.logger.debug('debug mode active')
    }
    
}
