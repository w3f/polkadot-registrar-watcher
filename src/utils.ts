import { WsChallengeUnrequest, WsChallengeRequest, WsErrorMessage, WsAck, JudgementRequest, WsChallengeRequestData } from "./types"
import { IdentityInfo, RegistrationJudgement, Registration, Event } from "@polkadot/types/interfaces"
import { Vec, Option, StorageKey, Data } from "@polkadot/types";
import fs from "fs";

export const initPersistenceDir = (dir: string): void =>{
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir)
  }
}

export const isDataPresent = (data: Data): boolean => {
  return !data.isNull && !data.isEmpty && !data.isNone
}

export const buildWsChallengeRequestData = (accountId: string, info: IdentityInfo): WsChallengeRequestData => {

  const accounts = {}
  if(isDataPresent(info.email)){
    accounts['email'] = info.email.value.toHuman()
  }
  if(isDataPresent(info.riot)){
    accounts['matrix'] = info.riot.value.toHuman()
  }
  if(isDataPresent(info.twitter)){
    accounts['twitter'] = info.twitter.value.toHuman()
  }
  if(isDataPresent(info.legal)){
    accounts['legal_name'] = info.legal.value.toHuman()
  }
  if(isDataPresent(info.display)){
    accounts['display_name'] = info.display.value.toHuman()
  }
  if(isDataPresent(info.web)){
    accounts['web'] = info.web.value.toHuman()
  }

  const request: WsChallengeRequestData = {
      address: accountId,
      accounts: accounts
  }
  return request
}

export const buildWsChallengeRequest = (accountId: string, info: IdentityInfo): WsChallengeRequest => {

  const request: WsChallengeRequest = {
    event: 'newJudgementRequest',
    data: buildWsChallengeRequestData(accountId,info)
  }
  return request
}

export const buildWsChallengeUnrequest = (accountId: string): WsChallengeUnrequest => {
  const request: WsChallengeUnrequest = {
    event: 'judgementUnrequested',
    data: {
      address: accountId,
    }
  }
  return request
}

export const wrongFormatMessage: WsErrorMessage = {
  event:'error',
  data:{
    error: 'wrong format'
  }
}

export const genericErrorMessage: WsErrorMessage = {
  event:'error',
  data:{
    error: 'something wrong'
  }
}

export const connectionEstablished: WsAck = {
  event:'ack',
  data:{
    result: 'connection Established'
  }
}

export const messagAcknowledged: WsAck = {
  event:'ack',
  data:{
    result: 'message acknowledged'
  }
}

export const buildJudgementGivenAck = (accountId: string): WsAck =>{
  return {
    event:'ack',
    data:{
      address: accountId,
      result: 'judgement given'
    }
  }
}

export const isJudgementUnrequested = (event: Event): boolean => {
  return event.section == 'identity' && event.method == 'JudgementUnrequested';
}

export const isJudgementRequestedEvent = (event: Event): boolean => {
  return event.section == 'identity' && event.method == 'JudgementRequested';
}

export const isJudgementGivenEvent = (event: Event): boolean => {
  return event.section == 'identity' && event.method == 'JudgementGiven';
}

export const isIdentityClearedEvent = (event: Event): boolean => {
  return event.section == 'identity' && (
    event.method == 'IdentityCleared' || event.method == 'IdentityKilled' );
}

export const isIdentitySetEvent = (event: Event): boolean => {
  return event.section == 'identity' && event.method == 'IdentitySet'
}

const _isErroneousJudgement = (judgement: RegistrationJudgement): boolean => {
  if(!judgement[1]) return false
  return judgement[1].isErroneous
}

const _isAlreadyJudged = (judgement: RegistrationJudgement): boolean => {
  if(!judgement[1]) return false
  return judgement[1].isErroneous || judgement[1].isReasonable || judgement[1].isKnownGood || judgement[1].isLowQuality || judgement[1].isOutOfDate
}

export const isJudgementsFieldDisplayNamesCompliant = (judgements: Vec<RegistrationJudgement>): boolean =>{
  let isCompliant = false
  for (const judgement of judgements) {
    if(_isAlreadyJudged(judgement) && !_isErroneousJudgement(judgement)) isCompliant = true 
  }
  return isCompliant
}

const _isOurRegistrarTargetted = (judgement: RegistrationJudgement, registrarIndex: number): boolean => {
  if(!judgement[0]) return false
  return judgement[0].toNumber() == registrarIndex
}

const _isInfoChallengeCompliant = (info: IdentityInfo): boolean => {
  return !isDataPresent(info.web) && !isDataPresent(info.legal) && !isDataPresent(info.image) && info.additional.isEmpty
}

export const isClaimChallengeCompliant = (judgements: Vec<RegistrationJudgement>, registrarIndex: number, info: IdentityInfo): boolean =>{
  let isCompliant = false
  for (const judgement of judgements) {
    if(_isOurRegistrarTargetted(judgement,registrarIndex) && !_isAlreadyJudged(judgement)) isCompliant = true
  }
  if(!_isInfoChallengeCompliant(info)) {
    // isCompliant = false // DISABLED Filtering, now it is a challenger task
  }
  
  return isCompliant
}

export const extractJudgementInfoFromEvent = (event: Event): JudgementRequest =>{
  const accountId = event.data[0].toString()
  const registrarIndex = event.data[1].toString()
  return {accountId,registrarIndex:parseInt(registrarIndex)}
}

export const extractIdentityInfoFromEvent = (event: Event): string =>{
  const accountId = event.data[0].toString()
  return accountId
}

export const extractRegistrationEntry = (key: StorageKey, exposure: Option<Registration>): {accountId: string; judgements: Vec<RegistrationJudgement>; info: IdentityInfo} => {
  const registration = exposure as Option<Registration>
  const accountId = key.args.map((k) => k.toHuman()).toString()
  const judgements = registration.unwrap().judgements
  const info = registration.unwrap().info 
  
  return {
    accountId: accountId,
    judgements: judgements,
    info: info
  }
}