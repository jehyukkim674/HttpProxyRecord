import { contextBridge } from 'electron';

// Task 6에서 IPC API를 채운다
contextBridge.exposeInMainWorld('api', {});
