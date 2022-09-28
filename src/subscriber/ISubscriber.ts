/* eslint-disable @typescript-eslint/interface-name-prefix */

import { WsChallengeRequest, WsChallengeUnrequest, WsPendingChallengesResponse, WsAck, WsDisplayNameResponse, WsVerifiedField } from "../types";

export interface ISubscriber{
  start(): Promise<void>;
  setNewJudgementRequestHandler(handler: (request: WsChallengeRequest) => void ): void;
  setJudgementUnrequestHandler(handler: (request: WsChallengeUnrequest) => void ): void;
  setJudgementGivenHandler(handler: (request: WsAck) => void ): void;
  getAllOurPendingWsChallengeRequests(): Promise<WsPendingChallengesResponse>;
  getAllDisplayNames(): Promise<WsDisplayNameResponse>;
  handleTriggerExtrinsicJudgement(result: string, address: string, verified: Array<WsVerifiedField>): Promise<boolean>;
}