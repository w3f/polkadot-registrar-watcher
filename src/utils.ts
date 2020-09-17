import { WsChallengeUnrequest, WsChallengeRequest, WsErrorMessage, WsAck } from "./types"
import { IdentityInfo } from "@polkadot/types/interfaces"

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