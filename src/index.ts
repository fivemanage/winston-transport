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
	private batch: Array<Record<string, unknown>> = [];
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
		if (this.batch.length === 0) return;

		const batch = this.batch;
		this.batch = [];

		try {
			const res = await fetch(this.apiUrl, {
				method: "POST",
				body: JSON.stringify(batch),
				headers: {
					"Content-Type": "application/json",
					Authorization: this.apiKey,
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
				this.batch.concat(batch);
			}
		}
	}

	log(info: Record<string, unknown>, next: () => void): void {
		this.batch.push({
			level: info.level,
			message: info.message,
			resource: info.resource,
			metadata: info.metadata,
		});

		if (this.batch.length >= this.batchCount) {
			this.processBatch();
		}

		next();
	}
}
