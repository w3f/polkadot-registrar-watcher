export interface InputConfig {
    logLevel: string;
    port: number;
    portWs: number;
    node: NodeConfig;
    requestsDir: string;
    registrar: {
      index: number;
      keystore: {
        walletFilePath: string;
        passwordFilePath: string;
      };
    };
}

interface NodeConfig {
  enabled: boolean;
  endpoint: string;
}

export interface JudgementRequest{
  accountId: string;
  registrarIndex: number;
}

export interface StorageData {
  challengeState: string;
  registrarIndex: number;
  challengeAttempts: number;
  lastChallengeResponse: string;
}

export enum ChallengeState {
  toBeChallenged,
  challenged
}

export enum JudgementResult{
  erroneous,
  reasonable
} 

export interface WsAck {
  event: 'ack';
  data: {
    result: string;
  };
}

export interface WsErrorMessage {
  event: 'error';
  data: {
    error: string;
  };
}

export interface WsChallengeRequestData {
  address: string;
  accounts: { matrix?: string; email?: string; twitter?: string; legal_name?: string };
}

export interface WsPendingChallengesResponse {
  event: 'pendingJudgementsResponse';
  data: Array<WsChallengeRequestData>;
}

export interface WsPendingChallengesRequest {
  event: 'pendingJudgementsRequest';
}

export interface WsChallengeRequest {
  event: 'newJudgementRequest';
  data: WsChallengeRequestData;
}

export interface WsChallengeResponse {
  event: 'judgementResult';
  data: JudgementResult;
}

export interface WsJudgementResult{
  address: string;
  judgement: string;
}

export interface WsChallengeUnrequest {
  event: 'judgementUnrequested';
  data: {
    address: string;
  };
}



