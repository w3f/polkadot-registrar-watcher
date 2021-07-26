import { InputConfig } from "../types";
import { Logger } from "@w3f/logger";
import { Subscriber } from "./subscriber";
import { SubscriberMock } from "./subscriberMock";
import { ISubscriber } from "./ISubscriber";
import { SubscriberProxy } from "./subscriberProxy";
import { SubscriberProxy2Levels } from "./subscriberProxy2Levels";

export class SubscriberFactory {
  constructor(
    private readonly cfg: InputConfig,
    private readonly logger: Logger) {
  }

  makeSubscriber = (): ISubscriber => {
    if(this.cfg.node.enabled == false){
      return new SubscriberMock();
    }
    if(this.cfg.registrar.proxy?.enabled){
      return new SubscriberProxy(this.cfg,this.logger)
    }
    if(this.cfg.registrar.proxy2Levels?.enabled){
      return new SubscriberProxy2Levels(this.cfg,this.logger)
    }
    
    return new Subscriber(this.cfg,this.logger); 
  }

}