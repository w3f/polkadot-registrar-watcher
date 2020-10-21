import * as express from 'express';
import { register } from 'prom-client';
import * as promClient from 'prom-client';
import { Logger } from '@w3f/logger';

export class Prometheus {

    constructor(private readonly logger: Logger) {}

    startCollection(): void {
        this.logger.info(
            'Starting the collection of metrics, the metrics are available on /metrics'
        );
        promClient.collectDefaultMetrics();
    }

    injectMetricsRoute(app: express.Application): void {
        app.get('/metrics', (req: express.Request, res: express.Response) => {
            res.set('Content-Type', register.contentType)
            res.end(register.metrics())
        })
    }


}
