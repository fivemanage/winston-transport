import fetch from "node-fetch";
import Transport from "winston-transport";
import { getErrorMessage, setImmediateInterval } from "./misc";

export type FivemanageTransportOptions = {
	apiKey: string;
	batchInterval?: number;
	batchCount?: number;
	shouldReprocessFailedBatches?: boolean;
} & Transport.TransportStreamOptions;

export class FivemanageTransport extends Transport {
	private readonly apiUrl = "https://api.fivemanage.com/api/logs/batch";
	private readonly apiKey: string;

	private datasetBatches: Record<string, Array<Record<string, unknown>>> = {};

	private readonly batchInterval: number;
	private readonly batchCount: number;
	private readonly shouldReprocessFailedBatches: boolean;

	constructor(opts: FivemanageTransportOptions) {
		super(opts);

		this.apiKey = opts.apiKey;
		this.batchInterval = opts.batchInterval ?? 5000;
		this.batchCount = opts.batchCount ?? 10;
		this.shouldReprocessFailedBatches =
			opts.shouldReprocessFailedBatches ?? true;

		this.startInterval();
	}

	startInterval() {
		setImmediateInterval(async () => {
			await this.processBatch();
		}, this.batchInterval);
	}

	async processBatch() {		
		const datasetBatches = this.datasetBatches;
		this.datasetBatches = {};

		for (const datasetId in datasetBatches) {
			if (datasetBatches[datasetId].length === 0) continue;

			const datasetBatch = datasetBatches[datasetId];

			try {
				const res = await fetch(this.apiUrl, {
					method: "POST",
					body: JSON.stringify(datasetBatch),
					headers: {
						"Content-Type": "application/json",
						Authorization: this.apiKey,
						"X-Fivemanage-Dataset": datasetId,
					},
				});
	
				if (res.ok === false) {
					const e = await res.json();
	
					throw new Error(
						`Status code: ${res.status}; Message: ${e.message ?? "Unknown"}`,
					);
				}
			} catch (error) {
				console.error(`Failed to process log batch -> ${getErrorMessage(error)}`);
	
				if (this.shouldReprocessFailedBatches) {
					this.datasetBatches[datasetId] = datasetBatch;
				}
			}
		}
	}

	log(info: Record<string, unknown>, next: () => void): void {
		/* this.batch.push({
			level: info.level,
			message: info.message,
			resource: info.resource,
			metadata: info.metadata,
		}); */

		const datasetId = info.datasetId as string ?? "default";
		if (!this.datasetBatches[datasetId]) {
			this.datasetBatches[datasetId] = [];
		}

		this.datasetBatches[datasetId].push({
			level: info.level,
			message: info.message,
			resource: info.resource,
			metadata: info.metadata,
		});

		if (this.datasetBatches[datasetId].length >= this.batchCount) {
			this.processBatch();
		}

		/* if (this.batch.length >= this.batchCount) {
			this.processBatch();
		} */

		next();
	}
}
