export class GameError extends Error {
	constructor(message: string, public gameState?: any) {
		super(message);
		this.name = "GameError";
	}
}

export class ModelError extends Error {
	constructor(message: string, public modelName?: string) {
		super(message);
		this.name = "ModelError";
	}
}
