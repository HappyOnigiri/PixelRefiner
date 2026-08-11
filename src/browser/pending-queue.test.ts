import { describe, expect, it } from "vitest";
import {
	createPendingImageQueue,
	type PendingQueueImage,
} from "./pending-queue";

type FakeSession = {
	images: PendingQueueImage[];
	activeId: string | null;
	processed: string[];
};

const createFakeSession = (
	ids: readonly string[],
	activeId: string | null,
): FakeSession => ({
	images: ids.map((id) => ({ id, status: "pending" })),
	activeId,
	processed: [],
});

const createQueue = (
	session: FakeSession,
	overrides: {
		onProcess?: (id: string) => void;
		leavePending?: readonly string[];
		onDrained?: (attemptedIds: readonly string[]) => void;
	} = {},
) => {
	const finish = (id: string) => {
		const image = session.images.find((item) => item.id === id);
		if (!image) return;
		session.processed.push(id);
		if (overrides.leavePending?.includes(id)) return;
		image.status = "done";
	};
	return createPendingImageQueue({
		getImages: () => session.images,
		getActiveImageId: () => session.activeId,
		processActiveImage: async () => {
			const activeId = session.activeId;
			if (!activeId) return;
			finish(activeId);
			overrides.onProcess?.(activeId);
		},
		processInactiveImage: async (id) => {
			finish(id);
			overrides.onProcess?.(id);
		},
		onDrained: overrides.onDrained,
	});
};

describe("pending image queue", () => {
	it("processes every pending image in list order", async () => {
		const session = createFakeSession(["a", "b", "c"], "c");

		await createQueue(session)();

		expect(session.processed).toEqual(["a", "b", "c"]);
		expect(session.images.every((image) => image.status === "done")).toBe(true);
	});

	it("processes the active image through the active path", async () => {
		const session = createFakeSession(["a", "b"], "b");
		const activePathIds: string[] = [];
		const inactivePathIds: string[] = [];
		const queue = createPendingImageQueue({
			getImages: () => session.images,
			getActiveImageId: () => session.activeId,
			processActiveImage: async () => {
				const image = session.images.find(
					(item) => item.id === session.activeId,
				);
				if (!image) return;
				activePathIds.push(image.id);
				image.status = "done";
			},
			processInactiveImage: async (id) => {
				const image = session.images.find((item) => item.id === id);
				if (!image) return;
				inactivePathIds.push(id);
				image.status = "done";
			},
		});

		await queue();

		expect(activePathIds).toEqual(["b"]);
		expect(inactivePathIds).toEqual(["a"]);
	});

	it("skips images that are already processing or done", async () => {
		const session = createFakeSession(["a", "b", "c"], "a");
		session.images[0].status = "processing";
		session.images[1].status = "done";

		await createQueue(session)();

		expect(session.processed).toEqual(["c"]);
	});

	it("lets the running loop pick up images added while processing", async () => {
		const session = createFakeSession(["a"], "a");
		const queue = createQueue(session, {
			onProcess: (id) => {
				if (id !== "a") return;
				session.images.push({ id: "b", status: "pending" });
			},
		});

		await queue();

		expect(session.processed).toEqual(["a", "b"]);
	});

	it("ignores calls made while the queue is running", async () => {
		const session = createFakeSession(["a", "b"], "b");
		let secondCall: Promise<void> | undefined;
		const queue = createQueue(session, {
			onProcess: (id) => {
				if (id !== "a") return;
				secondCall = queue();
			},
		});

		await queue();
		await secondCall;

		expect(session.processed).toEqual(["a", "b"]);
	});

	it("does not retry an image that stays pending", async () => {
		const session = createFakeSession(["a", "b"], "b");

		await createQueue(session, { leavePending: ["a"] })();

		expect(session.processed).toEqual(["a", "b"]);
		expect(session.images[0].status).toBe("pending");
	});

	it("reports the attempted images once the queue drains", async () => {
		const session = createFakeSession(["a", "b"], "b");
		const drained: string[][] = [];

		await createQueue(session, {
			onDrained: (attemptedIds) => drained.push([...attemptedIds]),
		})();

		expect(drained).toEqual([["a", "b"]]);
	});
});
