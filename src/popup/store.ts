import { configureStore, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { useDispatch, useSelector } from 'react-redux';
import type { Workflow } from '../shared/workflow';

type Notice = { message: string; error: boolean };

interface PopupState {
  prInput: string;
  sourceLabel: string;
  activeTabId: number | null;
  activeTabUrl: string | null;
  workflows: Record<string, Workflow>;
  busy: boolean;
  notice: Notice | null;
}

const initialState: PopupState = {
  prInput: '', sourceLabel: 'Manual', activeTabId: null, activeTabUrl: null,
  workflows: {}, busy: false, notice: null,
};

const popupSlice = createSlice({
  name: 'popup',
  initialState,
  reducers: {
    setPR(state, action: PayloadAction<{ url: string; source: string }>) {
      state.prInput = action.payload.url;
      state.sourceLabel = action.payload.source;
    },
    setActiveTab(state, action: PayloadAction<{ id: number | null; url: string | null }>) {
      state.activeTabId = action.payload.id;
      state.activeTabUrl = action.payload.url;
    },
    setWorkflows(state, action: PayloadAction<Record<string, Workflow>>) {
      state.workflows = action.payload;
    },
    setBusy(state, action: PayloadAction<boolean>) { state.busy = action.payload; },
    setNotice(state, action: PayloadAction<Notice | null>) { state.notice = action.payload; },
  },
});

export const { setPR, setActiveTab, setWorkflows, setBusy, setNotice } = popupSlice.actions;

export const store = configureStore({ reducer: { popup: popupSlice.reducer } });
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
