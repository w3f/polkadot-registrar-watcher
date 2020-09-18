import { JudgementRequest, ChallengeState } from "./types"
import { StorageData } from "./types"
import storage from 'node-persist';

export const initStorage = async (directory: string): Promise<void> => {
  await storage.init( {dir:directory} )
}

export const storeJudgementRequest = async (request: JudgementRequest): Promise<void> =>{
  const data: StorageData = {
    challengeState: ChallengeState.toBeChallenged.toString(),
    registrarIndex: request.registrarIndex,
    challengeAttempts: 0,
    lastChallengeResponse: ''
  }

  await storage.setItem(request.accountId,data)
}

export const storeChallenged = async (accountId: string): Promise<void> =>{
  const data: StorageData = await storage.getItem(accountId)
  data.challengeAttempts = data.challengeAttempts++
  data.challengeState = ChallengeState.challenged.toString()

  await storage.setItem(accountId,data)
}

export const isAccountAlreadyStored = async (accountId: string): Promise<boolean> =>{
  return (await storage.keys()).includes(accountId)
}

export const getJudgementRequestors = async (): Promise<string[]> =>{
  return await storage.keys()
}

export const getJudgementRequestorData = async (key: string): Promise<StorageData> =>{
  return await storage.getItem(key)
}

export const removeStoredJudgementRequest = async (accountId: string): Promise<void> =>{
  await storage.removeItem(accountId)
}

export const getToBeChallengedJudgementRequestors = async (): Promise<string[]> =>{ 
  const requestors = await getJudgementRequestors()
  const toBeChallengedRequestors = []
  for (const requestor of requestors) {
    const value = await getJudgementRequestorData(requestor)
    if(value['challengeState'] == ChallengeState.toBeChallenged.toString()) toBeChallengedRequestors.push(requestor)
  }
  return toBeChallengedRequestors
}