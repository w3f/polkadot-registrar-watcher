export interface InputConfig {
    logLevel: string;
    nodePort: number;
    challengerPort: number;
    endpoint: string;
    requestsDir: string;
    registrarIndex: number;
    registrar: {
      keystore: {
        filePath: string;
      };
    };
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

export interface WsChallengeRequest {
  event: 'newJudgementRequest';
  data: {
    address: string;
    accounts: { matrix?: string; email?: string};
  };
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



