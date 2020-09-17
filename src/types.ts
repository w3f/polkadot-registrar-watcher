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

export enum WSEventType{
  newJudgementRequest,
  judgementResult,
  WSAck,
  error
}

export interface WsAck {
  event: WSEventType;
  data: {
    result: string;
  };
}

export interface WsErrorMessage {
  event: WSEventType;
  data: {
    error: string;
  };
}

export interface WsChallengeRequest {
  event: WSEventType;
  data: {
    address: string;
    accounts: { matrix?: string; email?: string};
  };
}

export interface WsJudgementResult{
  address: string;
  judgement: string;
}

export interface WsChallengeResponse {
  event: WSEventType;
  data: JudgementResult;
}

