import { InputConfig } from "../types";
import { Logger } from "@w3f/logger";
import { Subscriber } from "./subscriber";
import { SubscriberMock } from "./subscriberMock";
import { ISubscriber } from "./ISubscriber";

export class SubscriberFactory {
  constructor(
    private readonly cfg: InputConfig,
    private readonly logger: Logger) {
  }

  makeSubscriber = (): ISubscriber => {
    if(this.cfg.node.enabled == false){
      return new SubscriberMock();
    }
    else return new Subscriber(this.cfg,this.logger); 
  }

}