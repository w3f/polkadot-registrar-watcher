/* eslint-disable @typescript-eslint/no-empty-function */
/* eslint-disable @typescript-eslint/no-unused-vars */

import { ISubscriber } from './ISubscriber'
import { WsChallengeRequest, WsChallengeUnrequest, WsPendingChallengesResponse, WsAck } from '../types'

export class SubscriberMock implements ISubscriber {

  start = async (): Promise<void> => { console.log('started mocked subscriber') }

  public setNewJudgementRequestHandler = (_handler: (request: WsChallengeRequest) => void ): void => {}

  public setJudgementUnrequestHandler = (_handler: (request: WsChallengeUnrequest) => void ): void => {}

  public setJudgementGivenHandler = (_handler: (request: WsAck) => void ): void => {}

  public getAllOurPendingWsChallengeRequests = async (): Promise<WsPendingChallengesResponse> => {
    const result: WsPendingChallengesResponse = {
      event: 'pendingJudgementsResponse',
      data: []
    }
    return result
  }

  public handleTriggerExtrinsicJudgement = async (judgementResult: string, target: string): Promise<boolean> => { return false }

}