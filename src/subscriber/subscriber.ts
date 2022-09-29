import { ApiPromise, WsProvider } from '@polkadot/api';
import { SessionIndex, Registration, IdentityInfo, Event } from '@polkadot/types/interfaces';
import { Logger } from '@w3f/logger';
import { Text } from '@polkadot/types/primitive';
import {
    InputConfig, JudgementResult, WsChallengeRequest, WsChallengeUnrequest, WsPendingChallengesResponse, WsAck, WsDisplayNameResponse, WsVerifiedField
} from '../types';
import { Option } from '@polkadot/types'
import fs from 'fs'
import { KeyringPair, KeyringPair$Json } from '@polkadot/keyring/types';
import {Keyring} from '@polkadot/keyring'
import { buildWsChallengeRequest, buildWsChallengeUnrequest, isJudgementGivenEvent, isJudgementUnrequested, isClaimChallengeCompliant, isJudgementRequestedEvent, isIdentityClearedEvent, extractJudgementInfoFromEvent, extractIdentityInfoFromEvent, buildWsChallengeRequestData, isIdentitySetEvent, buildJudgementGivenAck, extractRegistrationEntry, isDataPresent, isJudgementsFieldDisplayNamesCompliant, delay } from "../utils";
import { ISubscriber } from './ISubscriber'
import { IU8a } from '@polkadot/types-codec/types';

export class Subscriber implements ISubscriber {
    private chain: Text;
    protected api: ApiPromise;
    private endpoint: string;
    private sessionIndex: SessionIndex;
    private logLevel: string;
    protected registrarIndex: number; 
    private registrarWalletFilePath: string;
    private registrarPasswordFilePath: string;
    protected registrarAccount: KeyringPair;
    private wsNewJudgementRequestHandler: (request: WsChallengeRequest) => void;
    private wsJudgementUnrequestedHandler: (message: WsChallengeUnrequest) => void;
    private wsJudgementGievenHandler: (message: WsAck) => void;

    constructor(
        cfg: InputConfig,
        protected readonly logger: Logger) {
        this.endpoint = cfg.node.endpoint;
        this.logLevel = cfg.logLevel;
        this.registrarIndex = cfg.registrar.index;
        this.registrarWalletFilePath = cfg.registrar.keystore.walletFilePath;
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
      const endpoints = [this.endpoint]
      const provider = new WsProvider(endpoints);
      this.api = await ApiPromise.create({provider,throwOnConnect:true,throwOnUnknown:true})
      this.api.on('disconnected', async () => { 
        await delay(120000); //2 minute timeout
        if(!this.api.isConnected) 
          this.logger.error("Impossible to reconnect... exiting...")
          process.exit(-1);
      })
      
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
      this.logger.debug(`init registrar with index ${this.registrarIndex} ...`)
      const keyring = new Keyring({ type: 'sr25519' });
      const keyJson = JSON.parse(fs.readFileSync(this.registrarWalletFilePath, { encoding: 'utf-8' })) as KeyringPair$Json;
      const passwordContent = fs.readFileSync(this.registrarPasswordFilePath, { encoding: 'utf-8' });
      this.registrarAccount = keyring.addFromJson(keyJson)
      this.registrarAccount.decodePkcs8(passwordContent)

      this.logger.debug(`read account with address: ${keyring.pairs[0].toJson().address}`)
      this.logger.debug(`is locked: ${this.registrarAccount.isLocked}`)

      if(this.registrarAccount.isLocked){
        this.logger.error(`problem unlocking the wallet, exiting ...`)
        process.exit(1)
      }
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

    public setJudgementGivenHandler = (handler: (request: WsAck) => void ): void => {
      this.wsJudgementGievenHandler = handler
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
        this.wsJudgementGievenHandler(buildJudgementGivenAck(request.accountId))
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
      const judgements = identity.unwrapOrDefault().judgements
      const info: IdentityInfo = identity.unwrapOrDefault().info 
      this.logger.debug(info.toString())
      this.logger.debug(judgements.toString())
      this.logger.debug(identity.unwrapOrDefault().toString())

      if( identity.isEmpty ) {
        this.logger.info(`${accountId} has no active identity claims`)
        return
      }
      
      if( !isClaimChallengeCompliant(judgements, this.registrarIndex, info) ){
        this.logger.info(`${accountId} has a not interesting identity claim`)
        this.logger.info(`${judgements.toString()}`)
        this.logger.info(`${info.toString()}`)
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

    private _verifyOnchainMatch = async (target: string, verified: Array<WsVerifiedField>): Promise<IU8a> => {
      // Fetch the full identity from chain. Unwrapping on a `None` value would
      // indicate a bug since the target is checked in
      // `handleTriggerExtrinsicJudgement`.
      const info = (await this._getIdentity(target)).unwrap().info;

      // Check if the verified values match the on-chain identity.
      for (const field of verified) {
        switch (field.accountTy) {
          case "legal_name":
            if (field.value != info.legal.toHuman()) {
              throw new Error("Verified legal name does not mache on-chain value");
            }
            break;
          case "display_name":
            if (field.value != info.display.toHuman()) {
              throw new Error("Verified display name does not mache on-chain value");
            }
            break;
          case "email":
            if (field.value != info.email.toHuman()) {
              throw new Error("Verified email does not mache on-chain value");
            }
            break;
          case "twitter":
            if (field.value != info.twitter.toHuman()) {
              throw new Error("Verified twitter does not mache on-chain value");
            }
            break;
          case "matrix":
            if (field.value != info.riot.toHuman()) {
              throw new Error("Verified matrix does not mache on-chain value");
            }
            break;
          case "web":
            if (field.value != info.web.toHuman()) {
              throw new Error("Verified web does not mache on-chain value");
            }
            break;
          default:
            throw new Error(`Verified unsupported entries: ${field.accountTy}`);
        }
      }

      return info.hash;
    }

    public handleTriggerExtrinsicJudgement = async (judgementResult: string, target: string, verified: Array<WsVerifiedField>): Promise<boolean> => {

      if( ! await this._isAccountIdWaitingOurJudgement(target) ){
        this.logger.info(`the account id ${target} is not present in the pending judgment request set for our registrar...`)
        return
      }
      
      this.logger.debug('Extrinsic to be handled with values...')
      this.logger.debug(judgementResult)
      this.logger.debug(target)

      try {

        if(judgementResult == JudgementResult[JudgementResult.erroneous] ){
          const identityHash = await this._verifyOnchainMatch(target,verified)
          await this.triggerExtrinsicErroneous(target, identityHash)
        }
        else if(judgementResult == JudgementResult[JudgementResult.reasonable] ){
          const identityHash = await this._verifyOnchainMatch(target,verified)
          await this.triggerExtrinsicReasonable(target, identityHash)
        }

        // the transaction has been successfully transmitted
        return true
        
      } catch (error) {
        this.logger.error(error)
        return false
      }
      
    }

    public triggerExtrinsicReasonable = async (target: string, identityHash: IU8a): Promise<void> => {
      await this._triggerExtrinsicProvideJudgement(target,{Reasonable: true}, identityHash)
    }

    public triggerExtrinsicErroneous = async (target: string, identityHash: IU8a): Promise<void> =>{
      await this._triggerExtrinsicProvideJudgement(target,{Erroneous: true}, identityHash)
    }

    protected _triggerExtrinsicProvideJudgement = async (target: string, judgement: {Reasonable: boolean} | {Erroneous: boolean} , identityHash: IU8a): Promise<void> =>{
      const extrinsic = this.api.tx.identity.provideJudgement(this.registrarIndex,target,judgement, identityHash);
      const txHash = await extrinsic.signAndSend(this.registrarAccount);
      this.logger.info(`Judgement Submitted with hash ${txHash}`);
    }

    public getAllOurPendingWsChallengeRequests = async (): Promise<WsPendingChallengesResponse> => {

      const result: WsPendingChallengesResponse = {
        event: 'pendingJudgementsResponse',
        data: []
      }

      const entries = await this.api.query.identity.identityOf.entries()

      entries.forEach(([key, exposure]) => {

        const {accountId,judgements,info} = extractRegistrationEntry(key,exposure)

        this.logger.debug(`getAllOurPendingWsChallengeRequests candidates:`);
        this.logger.debug(`accountId: ${accountId}`);
        this.logger.debug(`\tregistration: ${judgements} `);
        this.logger.debug(`\tinfo: ${info} `);

        if(isClaimChallengeCompliant(judgements, this.registrarIndex, info)){
          result.data.push(buildWsChallengeRequestData(accountId, info))
        }

      })
    
      return result

    } 

    public getAllDisplayNames = async (): Promise<WsDisplayNameResponse> => {
      const result: WsDisplayNameResponse = {
        event: 'displayNamesResponse',
        data: []
      }

      const entries = await this.api.query.identity.identityOf.entries()

      entries.forEach(([key, exposure]) => {
        
        const {info, judgements, accountId} = extractRegistrationEntry(key,exposure)

        this.logger.debug(`getAllDisplayNames candidates`);
        this.logger.debug(`\tinfo: ${info}`);
        this.logger.debug(`\tjudgements: ${judgements}`);
        
        if(isJudgementsFieldDisplayNamesCompliant(judgements)){
          isDataPresent(info.display) && result.data.push({
            displayName:info.display.value.toHuman().toString(),
            address:accountId
          })
        }
      })

      return result
    }

    private _isAccountIdWaitingOurJudgement = async(acountId: string): Promise<boolean> => {
      let result = false

      const {data} = await this.getAllOurPendingWsChallengeRequests()
      for (const request of data) {
        if(request.address.trim() == acountId.trim()){
          result = true
          break
        }
      }

      return result
    }

}
