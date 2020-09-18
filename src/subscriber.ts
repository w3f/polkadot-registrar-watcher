import { ApiPromise, WsProvider } from '@polkadot/api';
import { SessionIndex, Registration, IdentityInfo } from '@polkadot/types/interfaces';
import { Logger } from '@w3f/logger';
import { Text } from '@polkadot/types/primitive';
import {
    InputConfig, JudgementResult, WsChallengeRequest, WsChallengeUnrequest
} from './types';
import Event from '@polkadot/types/generic/Event';
import { Option } from '@polkadot/types'
import fs from 'fs'
import { KeyringPair, KeyringPair$Json } from '@polkadot/keyring/types';
import {Keyring} from '@polkadot/keyring'
import { initStorage, storeJudgementRequest, storeChallenged, isAccountAlreadyStored, removeStoredJudgementRequest, getToBeChallengedJudgementRequestors } from "./storage";
import { buildWsChallengeRequest, buildWsChallengeUnrequest, isJudgementGivenEvent, isJudgementUnrequested, isJudgementsFieldCompliant, isJudgementRequestedEvent, isIdentityClearedEvent, extractJudgementInfoFromEvent, extractIdentityInfoFromEvent, initPersistenceDir } from "./utils";

export class Subscriber {
    private chain: Text;
    private api: ApiPromise;
    private endpoint: string;
    private sessionIndex: SessionIndex;
    private logLevel: string;
    private requestsDir: string;
    private registrarIndex = 3 
    private registrarKeyFilePath: string;
    private registrarAccount: KeyringPair;
    private wsNewJudgementRequestHandler: (request: WsChallengeRequest) => void;
    private wsJudgementUnrequestedHandler: (message: WsChallengeUnrequest) => void;

    constructor(
        cfg: InputConfig,
        private readonly logger: Logger) {
        this.endpoint = cfg.endpoint;
        this.logLevel = cfg.logLevel;
        this.requestsDir = cfg.requestsDir;
        this.registrarIndex = cfg.registrarIndex;
        this.registrarKeyFilePath = cfg.registrar.keystore.filePath;
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
      const keyJson = JSON.parse(fs.readFileSync(this.registrarKeyFilePath, { encoding: 'utf-8' })) as KeyringPair$Json;
      keyring.addFromJson(keyJson)
      this.logger.debug(`read account with address: ${keyring.pairs[0].toJson().address}`)
    }

    private _initInstanceVariables = async (): Promise<void> =>{
      this.sessionIndex = await this.api.query.session.currentIndex();
      this.logger.debug(
        `Session index: ${this.sessionIndex}`
      );
    }

    private _initPersistence = async (): Promise<void> =>{
      initPersistenceDir(this.requestsDir);
      await initStorage(this.requestsDir);
    }

    public setNewJudgementRequestHandler = (handler: (request: WsChallengeRequest) => void ): void => {
      this.wsNewJudgementRequestHandler = handler
    }

    public setJudgementUnrequestHandler = (handler: (request: WsChallengeUnrequest) => void ): void => {
      this.wsJudgementUnrequestedHandler = handler
    }

    private _triggerDebugActions = async (): Promise<void> =>{
      this.logger.debug('debug mode active')
      
      const entries = await this.api.query.identity.identityOf.entries()
      entries.forEach(([key, exposure]) => {
        const registration = <Option<Registration>> exposure
        this.logger.debug(`accountId: ${key.args.map((k) => k.toHuman())}`);
        this.logger.debug(`\tregistration:, ${registration.unwrap().judgements} `);

        if(isJudgementsFieldCompliant(registration.unwrap().judgements, this.registrarIndex)){
          const info: IdentityInfo = registration.unwrap().info 
        }

      });
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
          
          await this._handleJudgementEvents(event)

          await this._handleIdentityEvents(event)

        })
      })
    }

    private _handleIdentityEvents = async (event: Event): Promise<void> => {

      if (isIdentityClearedEvent(event)) {
        this._identityClearedHandler(event)
      }

    }

    private _handleJudgementEvents = async (event: Event): Promise<void> => {

      if (isJudgementRequestedEvent(event)) {
        await this._judgementRequestedHandler(event)
      }

      if (isJudgementGivenEvent(event)) {
        await this._judgementGivendHandler(event)
      }

      if (isJudgementUnrequested(event)) {
        await this._judgementUnrequestedHandler(event)
      }

    }

    private _identityClearedHandler = async (event: Event): Promise<void> => {
      this.logger.info('Identity Cleared Event Received')
      const accountId = extractIdentityInfoFromEvent(event)
      this.logger.info(`AccountId: ${accountId}`)
      if(await isAccountAlreadyStored(accountId)){

        await removeStoredJudgementRequest(accountId)

        try {
          this.wsJudgementUnrequestedHandler(buildWsChallengeUnrequest(accountId))
        } catch (error) {
          this.logger.error(`problem on notifying the challenger about the account ${accountId} JudgementUnrequested`)
          this.logger.error(error)
        }
      }
      
    }

    private _judgementUnrequestedHandler = async (event: Event): Promise<void> => {
      this.logger.info('New JudgementUnrequested')
      const request = extractJudgementInfoFromEvent(event)
      this.logger.info('AccountId:'+request.accountId+'\tRegistrarIndex:'+request.registrarIndex)
      if(request.registrarIndex == this.registrarIndex && await isAccountAlreadyStored(request.accountId)) {
 
        await removeStoredJudgementRequest(request.accountId)

        try {
          this.wsJudgementUnrequestedHandler(buildWsChallengeUnrequest(request.accountId))
        } catch (error) {
          this.logger.error(`problem on notifying the challenger about a ${request.accountId} JudgementUnrequested`)
          this.logger.error(error)
        }

      }
    }

    private _judgementGivendHandler = async (event: Event): Promise<void> => {
      this.logger.info('New JudgementGiven')
      const request = extractJudgementInfoFromEvent(event)
      this.logger.info('AccountId:'+request.accountId+'\tRegistrarIndex:'+request.registrarIndex)
      // TODO should we do something particular if the judgement is providede by another requestor?
      if(request.registrarIndex == this.registrarIndex && await isAccountAlreadyStored(request.accountId)) {
        this.logger.info(`Removing claimer from the stored handled accounts`)
        await removeStoredJudgementRequest(request.accountId)
      }
    }

    private _judgementRequestedHandler = async (event: Event): Promise<void> => {
      this.logger.info('New JudgementRequested')
      const request = extractJudgementInfoFromEvent(event)
      this.logger.info('AccountId:'+request.accountId+'\tRegistrarIndex:'+request.registrarIndex)
      if(request.registrarIndex == this.registrarIndex) {
        storeJudgementRequest(request)
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
      
      if( !isJudgementsFieldCompliant(judgements, this.registrarIndex) ){
        this.logger.info(`${accountId} has an invalid identity claim`)
        this.logger.info(`${identity.unwrap().judgements.toString()}`)
        //TODO eventually remove from storage
        return
      }

      try {
        this.wsNewJudgementRequestHandler(buildWsChallengeRequest(accountId,info))
        await storeChallenged(accountId)
      } catch (error) {
        this.logger.error(`problem on performing a new challenge for account ${accountId}`)
        this.logger.error(error)
      }
    }

    private _performNewChallengeAttempts = async (): Promise<void> =>{
      const requestors = await getToBeChallengedJudgementRequestors()

      for (const requestor of requestors) {
        this._performNewChallengeAttempt(requestor)
      }
    }

    

    private _getIdentity = async (accountId: string): Promise<Option<Registration>> =>{
      return await this.api.query.identity.identityOf(accountId)
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
