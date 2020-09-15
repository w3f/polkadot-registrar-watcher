import { ApiPromise, WsProvider } from '@polkadot/api';
import { SessionIndex, Registration, IdentityInfo } from '@polkadot/types/interfaces';
import { Logger } from '@w3f/logger';
import { Text } from '@polkadot/types/primitive';
import {
    InputConfig, JudgementRequest, StorageData
} from './types';
import Event from '@polkadot/types/generic/Event';
import { Option } from '@polkadot/types'
import fs from 'fs'
import storage from 'node-persist';

export class Subscriber {
    private chain: Text;
    private api: ApiPromise;
    private endpoint: string;
    private sessionIndex: SessionIndex;
    private logLevel: string;
    private readonly PERSISTENCE_DIR = './persistence'

    constructor(
        cfg: InputConfig,
        private readonly logger: Logger) {
        this.endpoint = cfg.endpoint;
        this.logLevel = cfg.logLevel;
    }

    public async start(): Promise<void> {
        await this._initAPI();
        await this._initPersistence();
        await this._initInstanceVariables();

        if(this.logLevel == 'debug') await this._triggerDebugActions()

        await this._handleNewHeadSubscriptions();
        await this._handleEventsSubscriptions();
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
      this.logger.debug(
        `Session index: ${this.sessionIndex}`
      );
    }

    private async _initPersistence(): Promise<void> {
      this._initPersistenceDir();
      await storage.init( {dir:this.PERSISTENCE_DIR} );
    }

    private _initPersistenceDir(): void{
      if (!fs.existsSync(this.PERSISTENCE_DIR)) {
        fs.mkdirSync(this.PERSISTENCE_DIR)
      }
    }

    private async _triggerDebugActions(): Promise<void>{
      this.logger.debug('debug mode active')

      let identity = await this._getIdentity('DVZTk1e5J42EW7LWsAFjyGa33KCC4RjfhU3ux8W1C1FYw2f')
      this.logger.debug('identity:' +identity)

      identity = await this._getIdentity('CoqkA7rw8zp3mzNfRFnrH5z6uuWyxC4YsZRGtrC73RRwYCG')
      this.logger.debug(identity.isEmpty ? 'true' : 'false')

    }

    private async _handleNewHeadSubscriptions(): Promise<void> {

      this.api.rpc.chain.subscribeNewHeads(async (header) => {
        this.logger.debug(
          `New header received: ${header}`
        );

        this._performNewChallengeAttempts()
      })
    }

    private async _handleEventsSubscriptions(): Promise<void> {
      this.api.query.system.events((events) => {

        events.forEach(async (record) => {
          const { event } = record;
          
          if (this._isJudgementRequestedEvent(event)) {
            await this._judgementRequestedHandler(event)
          }
        })
      })
    }

    private _isJudgementRequestedEvent(event: Event): boolean {
      return event.section == 'identity' && event.method == 'JudgementRequested';
    }

    private async _judgementRequestedHandler(event: Event): Promise<void>{
      this.logger.info('New JudgementRequested')
      const request = this._extractJudgementRequest(event)
      this._saveJudgementRequest(request)
      
    }
    
    private _extractJudgementRequest(event: Event): JudgementRequest{
      const accountId = event.data[0].toString()
      const registrarIndex = event.data[1].toString()
      this.logger.info('AccountId:'+accountId+'\tRegistrarIndex:'+registrarIndex)
      return {accountId,registrarIndex:parseInt(registrarIndex)}
    }

    private _saveJudgementRequest(request: JudgementRequest): void{
      const data: StorageData = {
        challengeState: 'toBeChallenged',
        registrarIndex: request.registrarIndex,
        challengeAttempts: 0,
        lastChallengeResponse: ''
      }

      storage.set(request.accountId,data)
    }

    private async _performNewChallengeAttempts(): Promise<void>{
      const requestors = await this._getJudgementRequestors()

      for (const requestor of requestors) {
        this._performNewChallengeAttempt(requestor)
      }
    }

    private async _getJudgementRequestors(): Promise<string[]>{
      return await storage.keys()
    }

    private async _getJudgementRequestorData(key: string): Promise<StorageData>{
      return await storage.get(key)
    }

    private async _performNewChallengeAttempt(accountId: string): Promise<void>{
      const identity = await this._getIdentity(accountId)
      if( identity.isEmpty ) return
      
      const data = await this._getJudgementRequestorData(accountId)
      if( data.challengeState !== 'toBeChallenged' ) return

      const judgements = identity.unwrap().judgements
      const info: IdentityInfo = identity.unwrap().info //info that need to be passed to the challenger app
      //this.logger.debug(info.toString())
      //this.logger.debug(judgements.toString())
    }

    private async _getIdentity(accountId: string): Promise<Option<Registration>>{
      return this.api.query.identity.identityOf(accountId)
    }



    
}
