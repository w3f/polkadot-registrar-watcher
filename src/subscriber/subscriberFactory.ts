import { InputConfig } from "../types";
import { Logger } from "@w3f/logger";
import { Subscriber } from "./subscriber";
import { SubscriberMock } from "./subscriberMock";
import { ISubscriber } from "./ISubscriber";
import { SubscriberProxy } from "./subscriberProxy";

export class SubscriberFactory {
  constructor(
    private readonly cfg: InputConfig,
    private readonly logger: Logger) {
  }

  makeSubscriber = (): ISubscriber => {
    if(this.cfg.node.enabled == false){
      return new SubscriberMock();
    }
    if(this.cfg.registrar.proxy && this.cfg.registrar.proxy.enabled){
      return new SubscriberProxy(this.cfg,this.logger)
    }
    else return new Subscriber(this.cfg,this.logger); 
  }

}