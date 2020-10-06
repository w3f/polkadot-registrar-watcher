/* eslint-disable @typescript-eslint/interface-name-prefix */

import { WsChallengeRequest, WsChallengeUnrequest, WsPendingChallengesResponse } from "../types";

export interface ISubscriber{
  start(): Promise<void>;
  setNewJudgementRequestHandler(handler: (request: WsChallengeRequest) => void ): void;
  setJudgementUnrequestHandler(handler: (request: WsChallengeUnrequest) => void ): void;
  getAllOurPendingWsChallengeRequests(): Promise<WsPendingChallengesResponse>;
  handleTriggerExtrinsicJudgement(result: string,address: string): Promise<void>;
}