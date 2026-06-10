/// <reference types="svelte" />
/// <reference types="vite/client" />

// Injected by the umami analytics script in index.html; absent when the script
// is blocked or fails to load.
interface Window {
	umami?: {
		track: (event: string, data?: Record<string, unknown>) => void;
	};
}
