import { ensureDirSync } from "https://deno.land/std@0.218.2/fs/ensure_dir.ts";

export class Cache {
	// Private fields
	readonly #cacheName: string;
	readonly #cachePath: string;
	readonly #cacheDir: string = "cache"; // Base directory for all caches

	constructor(cacheName: string) {
		if (!cacheName || typeof cacheName !== "string" || cacheName.includes("/") || cacheName.includes("\\")) {
			throw new Error("Invalid cache name provided. Must be a simple string.");
		}
		this.#cacheName = cacheName;
		this.#cachePath = `${this.#cacheDir}/${this.#cacheName}.json`;
	}

	// --- Private Methods ---

	#loadCache(): Record<string, unknown> {
		try {
			Deno.statSync(this.#cachePath);
			const cacheContent = Deno.readTextFileSync(this.#cachePath);

			if (!cacheContent.trim()) {
				return {};
			}

			return JSON.parse(cacheContent);
		} catch (error) {
			if (error instanceof Deno.errors.NotFound) {
				return {};
			} else if (error instanceof SyntaxError) {
				console.error(`Error parsing cache file ${this.#cachePath}. Returning empty cache. Error:`, error);
				return {};
			} else {
				console.error(`Error loading cache file ${this.#cachePath}:`, error);

				return {};
			}
		}
	}

	#saveCache(cache: Record<string, unknown>): void {
		try {
			// Ensure the base cache directory exists using std/fs module
			ensureDirSync(this.#cacheDir);
			// Write the file
			Deno.writeTextFileSync(this.#cachePath, JSON.stringify(cache, null, 2)); // Pretty print JSON
		} catch (error) {
			console.error(`Error saving cache for '${this.#cacheName}' to ${this.#cachePath}:`, error);
			// Optionally re-throw or handle more gracefully
		}
	}

	// --- Public API Methods ---

	/**
	 * Retrieves an item from the cache based on its key.
	 * @param key The unique identifier for the cached item.
	 * @returns The cached value, or null if the key is not found.
	 */
	get(key: string): unknown | null {
		const cache = this.#loadCache();
		// Use Object.prototype.hasOwnProperty.call for safer key checking
		return Object.prototype.hasOwnProperty.call(cache, key) ? cache[key] : null;
	}

	/**
	 * Adds or updates an item in the cache.
	 * @param key The unique identifier for the item.
	 * @param value The value to cache.
	 */
	set(key: string, value: unknown): void {
		const cache = this.#loadCache();
		cache[key] = value;
		this.#saveCache(cache);
	}

	/**
	 * Removes an item from the cache.
	 * @param key The key of the item to remove.
	 * @returns True if an item was removed, false otherwise.
	 */
	remove(key: string): boolean {
		const cache = this.#loadCache();
		if (Object.prototype.hasOwnProperty.call(cache, key)) {
			delete cache[key];
			this.#saveCache(cache);
			return true;
		}
		return false;
	}

	/**
	 * Clears all items from this specific cache instance.
	 */
	clear(): void {
		this.#saveCache({}); // Save an empty object
	}

	/**
	 * Gets the full file path of the cache file.
	 */
	getCacheFilePath(): string {
		return this.#cachePath;
	}
}
