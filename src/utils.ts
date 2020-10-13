import { WsChallengeUnrequest, WsChallengeRequest, WsErrorMessage, WsAck, JudgementRequest, WsChallengeRequestData } from "./types"
import { IdentityInfo, RegistrationJudgement } from "@polkadot/types/interfaces"
import Event from '@polkadot/types/generic/Event';
import { Vec } from "@polkadot/types";
import fs from "fs";

export const initPersistenceDir = (dir: string): void =>{
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir)
  }
}

export const buildWsChallengeRequestData = (accountId: string, info: IdentityInfo): WsChallengeRequestData => {

  const accounts = {}
  if(!info.email.isNull && !info.email.isEmpty && !info.email.isNone){
    accounts['email'] = info.email.value.toHuman()
  }
  if(!info.riot.isNull && !info.riot.isEmpty && !info.riot.isNone){
    accounts['matrix'] = info.riot.value.toHuman()
  }
  if(!info.twitter.isNull && !info.twitter.isEmpty && !info.twitter.isNone){
    accounts['twitter'] = info.twitter.value.toHuman()
  }
  if(!info.legal.isNull && !info.legal.isEmpty && !info.legal.isNone){
    accounts['legal_name'] = info.legal.value.toHuman()
  }
  if(!info.display.isNull && !info.display.isEmpty && !info.display.isNone){
    accounts['display_name'] = info.display.value.toHuman()
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

const _isAlreadyJudged = (judgement: RegistrationJudgement): boolean => {
  if(!judgement[1]) return false
  return judgement[1].isErroneous || judgement[1].isReasonable || judgement[1].isKnownGood || judgement[1].isLowQuality || judgement[1].isOutOfDate
}

const _isOurRegistrarTargetted = (judgement: RegistrationJudgement, registrarIndex: number): boolean => {
  if(!judgement[0]) return false
  return judgement[0].toNumber() == registrarIndex
}

export const isJudgementsFieldCompliant = (judgements: Vec<RegistrationJudgement>, registrarIndex: number): boolean =>{
  let isCompliant = false
  for (const judgement of judgements) {
    if(_isOurRegistrarTargetted(judgement,registrarIndex) && !_isAlreadyJudged(judgement)) isCompliant = true // add a further check here, it has not to be 
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