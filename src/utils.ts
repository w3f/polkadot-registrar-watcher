import { WsChallengeUnrequest, WsChallengeRequest, WsErrorMessage, WsAck, JudgementRequest } from "./types"
import { IdentityInfo, RegistrationJudgement } from "@polkadot/types/interfaces"
import Event from '@polkadot/types/generic/Event';
import { Vec } from "@polkadot/types";
import fs from "fs";

export const initPersistenceDir = (dir: string): void =>{
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir)
  }
}

export const buildWsChallengeRequest = (accountId: string, info: IdentityInfo): WsChallengeRequest => {

  const accounts = {}
  if(!info.email.isNull && !info.email.isEmpty && !info.email.isNone){
    accounts['email'] = info.email.value.toHuman()
  }
  if(!info.riot.isNull && !info.riot.isEmpty && !info.riot.isNone){
    accounts['matrix'] = info.riot.value.toHuman()
  }

  const request: WsChallengeRequest = {
    event: 'newJudgementRequest',
    data: {
      address: accountId,
      accounts: accounts
    }
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
    event.method == ' IdentityCleared' || event.method == '  IdentityKilled' || event.method == '  IdentitySet'
    );
}

export const isJudgementsFieldCompliant = (judgements: Vec<RegistrationJudgement>, registrarIndex: number): boolean =>{
  let isCompliant = false
  for (const judgement of judgements) {
    if(judgement[0].toNumber() == registrarIndex) isCompliant = true
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