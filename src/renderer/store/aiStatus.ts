// Transient "AI is working" state so the UI can show a spinner / disable the
// AI menu while a command runs.

import { create } from "zustand";

export interface AiStatusState {
  busy: boolean;
  label: string;
  setBusy(busy: boolean, label?: string): void;
}

export const useAiStatus = create<AiStatusState>((set) => ({
  busy: false,
  label: "",
  setBusy: (busy, label = "") => set({ busy, label }),
}));
