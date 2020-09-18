import { ApiPromise, WsProvider } from '@polkadot/api';
import { SessionIndex, Registration, IdentityInfo } from '@polkadot/types/interfaces';
import { Logger } from '@w3f/logger';
import { Text } from '@polkadot/types/primitive';
import {
    InputConfig, JudgementResult, WsChallengeRequest, WsChallengeUnrequest, WsPendingChallengesResponse
} from './types';
import Event from '@polkadot/types/generic/Event';
import { Option } from '@polkadot/types'
import fs from 'fs'
import { KeyringPair, KeyringPair$Json } from '@polkadot/keyring/types';
import {Keyring} from '@polkadot/keyring'
import { buildWsChallengeRequest, buildWsChallengeUnrequest, isJudgementGivenEvent, isJudgementUnrequested, isJudgementsFieldCompliant, isJudgementRequestedEvent, isIdentityClearedEvent, extractJudgementInfoFromEvent, extractIdentityInfoFromEvent, buildWsChallengeRequestData, isIdentitySetEvent } from "./utils";

export class Subscriber {
    private chain: Text;
    private api: ApiPromise;
    private endpoint: string;
    private sessionIndex: SessionIndex;
    private logLevel: string;
    private registrarIndex = 3 
    private registrarKeyFilePath: string;
    private registrarPasswordFilePath: string;
    private registrarAccount: KeyringPair;
    private wsNewJudgementRequestHandler: (request: WsChallengeRequest) => void;
    private wsJudgementUnrequestedHandler: (message: WsChallengeUnrequest) => void;

    constructor(
        cfg: InputConfig,
        private readonly logger: Logger) {
        this.endpoint = cfg.endpoint;
        this.logLevel = cfg.logLevel;
        this.registrarIndex = cfg.registrarIndex;
        this.registrarKeyFilePath = cfg.registrar.keystore.filePath;
        this.registrarPasswordFilePath = cfg.registrar.keystore.passwordFilePath;
    }

    public start = async (): Promise<void> => {
        
        await this._initAPI();
        this._initKey()
        await this._initInstanceVariables();
        
        if(this.logLevel == 'debug') this._triggerDebugActions()

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
      const passwordContent = fs.readFileSync(this.registrarPasswordFilePath, { encoding: 'utf-8' });
      this.registrarAccount = keyring.addFromJson(keyJson)
      this.registrarAccount.decodePkcs8(passwordContent)

      this.logger.debug(`read account with address: ${keyring.pairs[0].toJson().address}`)
      this.logger.debug(`is locked: ${this.registrarAccount.isLocked}`)
    }

    private _initInstanceVariables = async (): Promise<void> =>{
      this.sessionIndex = await this.api.query.session.currentIndex();
      this.logger.debug(
        `Session index: ${this.sessionIndex}`
      );
    }

    public setNewJudgementRequestHandler = (handler: (request: WsChallengeRequest) => void ): void => {
      this.wsNewJudgementRequestHandler = handler
    }

    public setJudgementUnrequestHandler = (handler: (request: WsChallengeUnrequest) => void ): void => {
      this.wsJudgementUnrequestedHandler = handler
    }

    private _triggerDebugActions = (): void =>{
      this.logger.debug('debug mode active')
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

      if (isIdentitySetEvent(event)) {
        this._judgementUpdateHandler(event)
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

      try {
        this.wsJudgementUnrequestedHandler(buildWsChallengeUnrequest(accountId))
      } catch (error) {
        this.logger.error(`problem on notifying the challenger about the account ${accountId} JudgementUnrequested`)
        this.logger.error(error)
      }
      
    }

    private _hasIdentityAlreadyRequestedOurJudgement = async(accountId: string): Promise<boolean> => {

      let result = false
      
      const pending = await this.getAllOurPendingWsChallengeRequests()
      for(const data of pending.data){
        if(data.address == accountId) {
          result = true
          break
        }
      }

      return result
    }

    private _judgementUpdateHandler = async (event: Event): Promise<void> => {
      const accountId = extractIdentityInfoFromEvent(event)
      if( await this._hasIdentityAlreadyRequestedOurJudgement(accountId) ) {

        this.logger.info(`New Update Identity Event for ${accountId}`)
        this._performNewChallengeAttempt(accountId)
      }
    }

    private _judgementUnrequestedHandler = async (event: Event): Promise<void> => {
      this.logger.info('New JudgementUnrequested')
      const request = extractJudgementInfoFromEvent(event)
      this.logger.info('AccountId:'+request.accountId+'\tRegistrarIndex:'+request.registrarIndex)
      if(request.registrarIndex == this.registrarIndex) {
 
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
      // TODO should we do something particular if the judgement is provided by another requestor?
      if(request.registrarIndex == this.registrarIndex) {
        this.logger.info(`sending ack to challenger`)
        //TODO check if it necessary
      }
    }

    private _judgementRequestedHandler = async (event: Event): Promise<void> => {
      this.logger.info('New JudgementRequested')
      const request = extractJudgementInfoFromEvent(event)
      this.logger.info('AccountId:'+request.accountId+'\tRegistrarIndex:'+request.registrarIndex)
      if(request.registrarIndex == this.registrarIndex) {
        this.logger.info(`event to be handled by registrar with index ${this.registrarIndex}`)
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
        this.logger.info(`${accountId} has a not interesting identity claim`)
        this.logger.info(`${identity.unwrap().judgements.toString()}`)
        return
      }

      try {
        this.wsNewJudgementRequestHandler(buildWsChallengeRequest(accountId,info))
      } catch (error) {
        this.logger.error(`problem on performing a new challenge for account ${accountId}`)
        this.logger.error(error)
      }
    }    

    private _getIdentity = async (accountId: string): Promise<Option<Registration>> =>{
      return await this.api.query.identity.identityOf(accountId)
    }

    public handleTriggerExtrinsicJudgement = async (judgementResult: string, target: string): Promise<void> => {

      // TODO add a check 

      this.logger.debug('Extrinsic to be handled with values...')
      this.logger.debug(judgementResult)
      this.logger.debug(target)

      try {

        if(judgementResult == JudgementResult[JudgementResult.erroneous] ){
          await this.triggerExtrinsicErroneous(target)
        }
        else if(judgementResult == JudgementResult[JudgementResult.reasonable] ){
          await this.triggerExtrinsicReasonable(target)
        }
        
      } catch (error) {
        this.logger.error(error)
      }
      
    }

    public triggerExtrinsicReasonable = async (target: string): Promise<void> => {
      await this._triggerExtrinsicProvideJudgement(target,{Reasonable: true})
    }

    public triggerExtrinsicErroneous = async (target: string): Promise<void> =>{
      await this._triggerExtrinsicProvideJudgement(target,{Erroneous: true})
    }

    private _triggerExtrinsicProvideJudgement = async (target: string, judgement: {Reasonable: boolean} | {Erroneous: boolean} ): Promise<void> =>{      
      //const txHash = await this.api.tx.identity.provideJudgement(this.registrarIndex,target,judgement).signAndSend(this.registrarAccount)
      this.logger.debug(`account ${JSON.stringify(this.registrarAccount)}`)
      const extrinsic = this.api.tx.identity.provideJudgement(this.registrarIndex,target,judgement)
      this.logger.debug(`extrinsic ${JSON.stringify(extrinsic)}`)
      const signed = extrinsic.sign(this.registrarAccount)
      this.logger.debug(`signed ${JSON.stringify(signed)}`)
      const txHash = await extrinsic.signAndSend(this.registrarAccount)
      this.logger.info(`Judgement Submitted with hash ${txHash}`);
    }

    public getAllOurPendingWsChallengeRequests = async (): Promise<WsPendingChallengesResponse> => {

      const result: WsPendingChallengesResponse = {
        event: 'pendingJudgementsResponse',
        data: []
      }

      const entries = await this.api.query.identity.identityOf.entries()

      entries.forEach(([key, exposure]) => {
        const registration = exposure as Option<Registration>
        const accountId = key.args.map((k) => k.toHuman()).toString()
        const judgements = registration.unwrap().judgements
        const info = registration.unwrap().info 
        this.logger.debug(`accountId: ${accountId}`);
        this.logger.debug(`\tregistration: ${judgements} `);
        this.logger.debug(`\tinfo: ${info} `);

        if(isJudgementsFieldCompliant(judgements, this.registrarIndex)){
          result.data.push(buildWsChallengeRequestData(accountId, info))
        }

      })
    
      return result

    } 

}
