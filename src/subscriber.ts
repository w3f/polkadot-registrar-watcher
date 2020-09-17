import { ApiPromise, WsProvider } from '@polkadot/api';
import { SessionIndex, Registration, IdentityInfo, RegistrationJudgement } from '@polkadot/types/interfaces';
import { Logger } from '@w3f/logger';
import { Text } from '@polkadot/types/primitive';
import {
    InputConfig, JudgementRequest, StorageData, JudgementResult, ChallengeState, WsChallengeRequest, WSEventType
} from './types';
import Event from '@polkadot/types/generic/Event';
import { Option, Vec } from '@polkadot/types'
import fs from 'fs'
import storage from 'node-persist';
import { KeyringPair } from '@polkadot/keyring/types';
import {Keyring} from '@polkadot/keyring'

export class Subscriber {
    private chain: Text;
    private api: ApiPromise;
    private endpoint: string;
    private sessionIndex: SessionIndex;
    private logLevel: string;
    private requestsDir: string;
    private registrarIndex = 3 
    private readonly REGISTRAR_SEED = 'entire material egg meadow latin bargain dutch coral blood melt acoustic thought' //TODO configurable from file
    private registrarAccount: KeyringPair;
    private wsNewJudgementRequestHandler: (request: WsChallengeRequest) => void;

    constructor(
        cfg: InputConfig,
        private readonly logger: Logger) {
        this.endpoint = cfg.endpoint;
        this.logLevel = cfg.logLevel;
        this.requestsDir = cfg.requestsDir;
        this.registrarIndex = cfg.registrarIndex;
    }

    public start = async (): Promise<void> => {
        
        await this._initAPI();
        this._initKey()
        await this._initPersistence();
        await this._initInstanceVariables();
        
        if(this.logLevel == 'debug') await this._triggerDebugActions()

        false && await this._handleNewHeadSubscriptions(); //No need to perform new challenges out of the event sub for now: DISABLED with false
        await this._handleEventsSubscriptions();
    }

    private _initAPI = async (): Promise<void> =>{
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

    private _initKey = (): void =>{
      const keyring = new Keyring({ type: 'sr25519' });
      this.registrarAccount = keyring.addFromUri(this.REGISTRAR_SEED)
    }

    private _initInstanceVariables = async (): Promise<void> =>{
      this.sessionIndex = await this.api.query.session.currentIndex();
      this.logger.debug(
        `Session index: ${this.sessionIndex}`
      );
    }

    private _initPersistence = async (): Promise<void> =>{
      this._initPersistenceDir();
      await storage.init( {dir:this.requestsDir} );
    }

    private _initPersistenceDir = (): void =>{
      if (!fs.existsSync(this.requestsDir)) {
        fs.mkdirSync(this.requestsDir)
      }
    }

    public setNewJudgementRequestHandler = (handler: (request: WsChallengeRequest) => void ): void => {
      this.wsNewJudgementRequestHandler = handler
    }

    private _triggerDebugActions = async (): Promise<void> =>{
      this.logger.debug('debug mode active')

      let identity = await this._getIdentity('DVZTk1e5J42EW7LWsAFjyGa33KCC4RjfhU3ux8W1C1FYw2f')
      this.logger.debug('identity:' +identity)

      identity = await this._getIdentity('CoqkA7rw8zp3mzNfRFnrH5z6uuWyxC4YsZRGtrC73RRwYCG')
      this.logger.debug(identity.isEmpty ? 'true' : 'false')
    }

    private _handleNewHeadSubscriptions = async (): Promise<void> =>{

      this.api.rpc.chain.subscribeNewHeads(async (header) => {
        this.logger.debug(
          `New header received: ${header}`
        );

        this._performNewChallengeAttempts()
      })
    }

    private _handleEventsSubscriptions = async (): Promise<void> => {
      this.api.query.system.events((events) => {

        events.forEach(async (record) => {
          const { event } = record;
          
          if (this._isJudgementRequestedEvent(event)) {
            await this._judgementRequestedHandler(event)
          }
        })
      })
    }

    private _isJudgementRequestedEvent = (event: Event): boolean => {
      return event.section == 'identity' && event.method == 'JudgementRequested';
    }

    private _judgementRequestedHandler = async (event: Event): Promise<void> => {
      this.logger.info('New JudgementRequested')
      const request = this._extractJudgementRequest(event)
      if(request.registrarIndex == this.registrarIndex) {
        this._storeJudgementRequest(request)
        this.logger.info(`new judgement request to handle by registrar with index ${this.registrarIndex}`)
        this._performNewChallengeAttempt(request.accountId)        
      }
    }

    private _performNewChallengeAttempt = async (accountId: string): Promise<void> =>{
      const identity = await this._getIdentity(accountId)
      const judgements = identity.unwrap().judgements
      const info: IdentityInfo = identity.unwrap().info 
      this.logger.debug(info.toString())
      this.logger.debug(judgements.toString())
      this.logger.debug(identity.unwrap().toString())

      if( identity.isEmpty ) {
        this.logger.info(`${accountId} has no active identity claims`)
        //TODO eventually remove from storage
        return
      }
      
      if( !this._isJudgementsFieldCompliant(judgements) ){
        this.logger.info(`${accountId} has an invalid identity claim`)
        this.logger.info(`${identity.unwrap().judgements.toString()}`)
        //TODO eventually remove from storage
        return
      }

      try {
        this.wsNewJudgementRequestHandler(this._buildWsChallengeRequest(accountId,info))
        await this._storeChallenged(accountId)
      } catch (error) {
        this.logger.error(`problem on performing a new challenge for account ${accountId}`)
        this.logger.error(error)
      }
    }

    private _isJudgementsFieldCompliant(judgements: Vec<RegistrationJudgement>): boolean{
      let isCompliant = false
      for (const judgement of judgements) {
        if(judgement[0].toNumber() == this.registrarIndex) isCompliant = true
      }
      return isCompliant
    }
    
    private _extractJudgementRequest = (event: Event): JudgementRequest =>{
      const accountId = event.data[0].toString()
      const registrarIndex = event.data[1].toString()
      this.logger.info('AccountId:'+accountId+'\tRegistrarIndex:'+registrarIndex)
      return {accountId,registrarIndex:parseInt(registrarIndex)}
    }

    private _buildWsChallengeRequest = (accountId: string, info: IdentityInfo): WsChallengeRequest => {

      const accounts = {}
      if(!info.email.isNull && !info.email.isEmpty && !info.email.isNone){
        accounts['email'] = info.email.toString()
      }
      if(!info.riot.isNull && !info.riot.isEmpty && !info.riot.isNone){
        accounts['riot'] = info.riot.toString()
      }

      const request: WsChallengeRequest = {
        event: WSEventType.newJudgementRequest,
        data: {
          address: accountId,
          accounts: accounts
        }
      }
      return request
    }

    private _storeJudgementRequest = async (request: JudgementRequest): Promise<void> =>{
      const data: StorageData = {
        challengeState: ChallengeState.toBeChallenged.toString(),
        registrarIndex: request.registrarIndex,
        challengeAttempts: 0,
        lastChallengeResponse: ''
      }

      await storage.setItem(request.accountId,data)
    }

    private _storeChallenged = async (accountId: string): Promise<void> =>{
      const data: StorageData = await storage.getItem(accountId)
      data.challengeAttempts = data.challengeAttempts++
      data.challengeState = ChallengeState.challenged.toString()

      storage.setItem(accountId,data)
    }

    private _performNewChallengeAttempts = async (): Promise<void> =>{
      const requestors = await this._getToBeChallengedJudgementRequestors()

      for (const requestor of requestors) {
        this._performNewChallengeAttempt(requestor)
      }
    }

    private _getToBeChallengedJudgementRequestors = async (): Promise<string[]> =>{ 
      const requestors = await this._getJudgementRequestors()
      const toBeChallengedRequestors = []
      for (const requestor of requestors) {
        const value = this._getJudgementRequestorData(requestor)
        if(value['challengeState'] == ChallengeState.toBeChallenged.toString()) toBeChallengedRequestors.push(requestor)
      }
      return toBeChallengedRequestors
    }

    private _getJudgementRequestors = async (): Promise<string[]> =>{
      return await storage.keys()
    }

    private _getJudgementRequestorData = async (key: string): Promise<StorageData> =>{
      return await storage.getItem(key)
    }

    private _getIdentity = async (accountId: string): Promise<Option<Registration>> =>{
      return await this.api.query.identity.identityOf(accountId)
    }

    private _removeJudgementRequest = async (accountId: string): Promise<void> =>{
      await storage.removeItem(accountId)
    }

    public handleTriggerExtrinsicJudgement = async (judgementResult: string, target: string): Promise<void> => {

      // TODO add a check 

      try {

        if(judgementResult == JudgementResult.erroneous.toString()){
          await this.triggerExtrinsicErroneous(target)
        }
        else if(judgementResult == JudgementResult.reasonable.toString()){
          await this.triggerExtrinsicReasonable(target)
        }
        this._removeJudgementRequest(target)
        
      } catch (error) {
        this.logger.error(error)
      }
      
    }

    public triggerExtrinsicReasonable = async (target: string): Promise<void> => {
      await this._triggerExtrinsicProvideJudgement(target,{KnownGood: true})
    }

    public triggerExtrinsicErroneous = async (target: string): Promise<void> =>{
      await this._triggerExtrinsicProvideJudgement(target,{Erroneous: true})
    }

    private _triggerExtrinsicProvideJudgement = async (target: string, judgement: {KnownGood: boolean} | {Erroneous: boolean} ): Promise<void> =>{      
      const txHash = await this.api.tx.identity.provideJudgement(this.registrarIndex,target,judgement).signAndSend(this.registrarAccount)
      this.logger.info(`Judgement Submitted with hash ${txHash}`);
    }

}
