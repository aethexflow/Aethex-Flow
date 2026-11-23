import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  increment,
} from 'firebase/firestore';
import { db, OperationType, handleFirestoreError } from '../firebase';
import type { WorkflowNode, WorkflowEdge } from './workflowDag';
import {
  buildSafeDocId,
  stripUndefinedDeep,
  sanitizeWorkflowGraphForFirestore,
  sanitizeSamplePayloadForFirestore,
  sanitizeTemplateTags,
  summarizeWorkflowTemplate,
  type SanitizedWorkflowGraph,
  type WorkflowTemplateSummary,
} from './firestoreSanitize';

export {
  buildSafeDocId,
  stripUndefinedDeep,
  sanitizeWorkflowGraphForFirestore,
  sanitizeSamplePayloadForFirestore,
  sanitizeTemplateTags,
  summarizeWorkflowTemplate,
};
export type { SanitizedWorkflowGraph, WorkflowTemplateSummary };

export interface CloudSavedWorkflow {
  id: string;
  uid: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  nodesCount: number;
  edgesCount: number;
  graph: {
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
  };
  samplePayload?: Record<string, unknown>;
  isPublic: boolean;
  updatedAtLabel?: string;
}

export interface PublicCommunityWorkflow {
  id: string;
  authorUid: string;
  authorName: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  graph: {
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
  };
  samplePayload?: Record<string, unknown>;
  runsCount: number;
}

export interface CloudChatMessage {
  id: string;
  uid: string;
  role: 'user' | 'assistant';
  content: string;
  suggestedTool?: string;
  videoInstruction?: string;
  engine?: string;
  timestamp: string;
}

export interface WorkspacePreferencesRecord {
  theme: 'dark' | 'light';
  pinnedToolIds: string[];
  density: 'comfortable' | 'compact';
}

export function subscribeWorkspacePreferences(
  uid: string,
  onData: (prefs: WorkspacePreferencesRecord) => void
): () => void {
  const path = `users/${uid}/preferences/workspace`;
  const ref = doc(db, 'users', uid, 'preferences', 'workspace');
  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) return;
      const d = snap.data();
      onData({
        theme: d.theme === 'light' ? 'light' : 'dark',
        pinnedToolIds: Array.isArray(d.pinnedToolIds)
          ? d.pinnedToolIds.map((x: unknown) => String(x)).slice(0, 20)
          : [],
        density: d.density === 'compact' ? 'compact' : 'comfortable',
      });
    },
    (err) => handleFirestoreError(err, OperationType.GET, path)
  );
}

export async function saveWorkspacePreferences(
  uid: string,
  prefs: WorkspacePreferencesRecord
): Promise<void> {
  const path = `users/${uid}/preferences/workspace`;
  const ref = doc(db, 'users', uid, 'preferences', 'workspace');
  let snap;
  try {
    snap = await getDoc(ref);
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }

  const payload = {
    uid,
    theme: prefs.theme === 'light' ? 'light' : 'dark',
    pinnedToolIds: prefs.pinnedToolIds.slice(0, 20),
    density: prefs.density === 'compact' ? 'compact' : 'comfortable',
    updatedAt: serverTimestamp(),
  };

  if (!snap.exists()) {
    try {
      await setDoc(ref, payload);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  } else {
    try {
      await updateDoc(ref, {
        theme: payload.theme,
        pinnedToolIds: payload.pinnedToolIds,
        density: payload.density,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  }
}

export function subscribeUserActivities(
  uid: string,
  onData: (items: Array<{ id: string; action: string; time: string; status: string }>) => void
): () => void {
  const path = `users/${uid}/activities`;
  const q = query(
    collection(db, 'users', uid, 'activities'),
    orderBy('createdAt', 'desc'),
    limit(12)
  );
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => {
        const data = d.data();
        const ts = data.createdAt?.toDate ? data.createdAt.toDate() : null;
        return {
          id: String(data.id || d.id),
          action: String(data.action || ''),
          time: ts
            ? ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : 'Synced',
          status: String(data.status || 'Completed'),
        };
      });
      onData(items);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, path)
  );
}

export async function addUserActivity(
  uid: string,
  action: string,
  status = 'Completed'
): Promise<void> {
  const id = buildSafeDocId('act');
  const path = `users/${uid}/activities/${id}`;
  try {
    await setDoc(doc(db, 'users', uid, 'activities', id), {
      id,
      uid,
      action: action.trim().slice(0, 300) || 'Workspace event',
      status: status.trim().slice(0, 40) || 'Completed',
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export function subscribeUserChats(
  uid: string,
  onData: (messages: CloudChatMessage[]) => void
): () => void {
  const path = `users/${uid}/chats`;
  const q = query(
    collection(db, 'users', uid, 'chats'),
    orderBy('createdAt', 'asc'),
    limit(80)
  );
  return onSnapshot(
    q,
    (snap) => {
      const list: CloudChatMessage[] = snap.docs.map((d) => {
        const data = d.data();
        const ts = data.createdAt?.toDate ? data.createdAt.toDate() : null;
        return {
          id: String(data.id || d.id),
          uid: String(data.uid || uid),
          role: data.role === 'user' ? 'user' : 'assistant',
          content: String(data.content || ''),
          suggestedTool: data.suggestedTool ? String(data.suggestedTool) : undefined,
          videoInstruction: data.videoInstruction ? String(data.videoInstruction) : undefined,
          engine: data.engine ? String(data.engine) : undefined,
          timestamp: ts
            ? ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : 'Synced',
        };
      });
      onData(list);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, path)
  );
}

export async function appendUserChatMessage(
  uid: string,
  msg: {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    suggestedTool?: string;
    videoInstruction?: string;
    engine?: string;
  }
): Promise<void> {
  const safeId = msg.id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  const path = `users/${uid}/chats/${safeId}`;
  const payload: Record<string, unknown> = {
    id: safeId,
    uid,
    role: msg.role,
    content: msg.content.trim().slice(0, 12000) || 'Empty message',
    createdAt: serverTimestamp(),
  };
  if (msg.suggestedTool) {
    payload.suggestedTool = msg.suggestedTool.slice(0, 64);
  }
  if (msg.videoInstruction) {
    payload.videoInstruction = msg.videoInstruction.slice(0, 1000);
  }
  if (msg.engine) {
    payload.engine = msg.engine.slice(0, 64);
  }

  try {
    await setDoc(doc(db, 'users', uid, 'chats', safeId), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function clearUserChatHistory(
  uid: string,
  messageIds: string[]
): Promise<void> {
  for (const id of messageIds) {
    const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
    const path = `users/${uid}/chats/${safeId}`;
    try {
      await deleteDoc(doc(db, 'users', uid, 'chats', safeId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  }
}

export function subscribeUserWorkflows(
  uid: string,
  onData: (workflows: CloudSavedWorkflow[]) => void
): () => void {
  const path = `users/${uid}/workflows`;
  const q = query(
    collection(db, 'users', uid, 'workflows'),
    orderBy('updatedAt', 'desc'),
    limit(30)
  );
  return onSnapshot(
    q,
    (snap) => {
      const items: CloudSavedWorkflow[] = snap.docs.map((d) => {
        const data = d.data();
        const ts = data.updatedAt?.toDate ? data.updatedAt.toDate() : null;
        return {
          id: String(data.id || d.id),
          uid: String(data.uid || uid),
          name: String(data.name || 'Untitled Workflow'),
          description: String(data.description || ''),
          category: String(data.category || 'Automation'),
          tags: Array.isArray(data.tags) ? data.tags.map((t: unknown) => String(t)).slice(0, 8) : [],
          nodesCount: Number(data.nodesCount || 0),
          edgesCount: Number(data.edgesCount || 0),
          graph: {
            nodes: Array.isArray(data.graph?.nodes) ? data.graph.nodes : [],
            edges: Array.isArray(data.graph?.edges) ? data.graph.edges : [],
          },
          samplePayload:
            data.samplePayload && typeof data.samplePayload === 'object' && !Array.isArray(data.samplePayload)
              ? (data.samplePayload as Record<string, unknown>)
              : undefined,
          isPublic: Boolean(data.isPublic),
          updatedAtLabel: ts ? ts.toLocaleDateString() : 'Cloud Synced',
        };
      });
      onData(items);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, path)
  );
}

export async function saveUserWorkflow(
  uid: string,
  input: {
    id?: string;
    name: string;
    description: string;
    category?: string;
    tags?: string[] | string;
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
    samplePayload?: Record<string, unknown> | string;
    isPublic?: boolean;
  }
): Promise<string> {
  const workflowId = input.id
    ? input.id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128)
    : buildSafeDocId('wf');
  const path = `users/${uid}/workflows/${workflowId}`;
  const ref = doc(db, 'users', uid, 'workflows', workflowId);
  const graph = sanitizeWorkflowGraphForFirestore(input.nodes, input.edges);
  const category = String(input.category || 'Automation').trim().slice(0, 40) || 'Automation';
  const tags = sanitizeTemplateTags(input.tags);
  const samplePayload = sanitizeSamplePayloadForFirestore(input.samplePayload);

  let snap;
  try {
    snap = await getDoc(ref);
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }

  if (!snap.exists()) {
    try {
      await setDoc(ref, {
        id: workflowId,
        uid,
        name: input.name.trim().slice(0, 120) || 'Untitled Workflow',
        description: input.description.trim().slice(0, 500),
        category,
        tags,
        nodesCount: graph.nodes.length,
        edgesCount: graph.edges.length,
        graph,
        samplePayload,
        isPublic: Boolean(input.isPublic),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  } else {
    try {
      await updateDoc(ref, {
        name: input.name.trim().slice(0, 120) || 'Untitled Workflow',
        description: input.description.trim().slice(0, 500),
        category,
        tags,
        nodesCount: graph.nodes.length,
        edgesCount: graph.edges.length,
        graph,
        samplePayload,
        isPublic: Boolean(input.isPublic),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  }

  return workflowId;
}

export async function deleteUserWorkflow(uid: string, workflowId: string): Promise<void> {
  const path = `users/${uid}/workflows/${workflowId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'workflows', workflowId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export function subscribePublicWorkflows(
  onData: (workflows: PublicCommunityWorkflow[]) => void
): () => void {
  const path = 'publicWorkflows';
  const q = query(
    collection(db, 'publicWorkflows'),
    where('runsCount', '>=', 0),
    orderBy('runsCount', 'desc'),
    limit(24)
  );
  return onSnapshot(
    q,
    (snap) => {
      const list: PublicCommunityWorkflow[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: String(data.id || d.id),
          authorUid: String(data.authorUid || ''),
          authorName: String(data.authorName || 'Community Author'),
          name: String(data.name || 'Community Workflow'),
          description: String(data.description || ''),
          category: String(data.category || 'Automation'),
          tags: Array.isArray(data.tags) ? data.tags.map((t: unknown) => String(t)).slice(0, 8) : [],
          graph: {
            nodes: Array.isArray(data.graph?.nodes) ? data.graph.nodes : [],
            edges: Array.isArray(data.graph?.edges) ? data.graph.edges : [],
          },
          samplePayload:
            data.samplePayload && typeof data.samplePayload === 'object' && !Array.isArray(data.samplePayload)
              ? (data.samplePayload as Record<string, unknown>)
              : undefined,
          runsCount: Number(data.runsCount || 0),
        };
      });
      onData(list);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, path)
  );
}

export async function publishCommunityWorkflow(
  uid: string,
  authorName: string,
  input: {
    name: string;
    description: string;
    category: string;
    tags?: string[] | string;
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
    samplePayload?: Record<string, unknown> | string;
  }
): Promise<string> {
  const workflowId = buildSafeDocId('pubwf');
  const path = `publicWorkflows/${workflowId}`;
  const graph = sanitizeWorkflowGraphForFirestore(input.nodes, input.edges);
  const tags = sanitizeTemplateTags(input.tags);
  const samplePayload = sanitizeSamplePayloadForFirestore(input.samplePayload);

  try {
    await setDoc(doc(db, 'publicWorkflows', workflowId), {
      id: workflowId,
      authorUid: uid,
      authorName: authorName.trim().slice(0, 100) || 'Community Creator',
      name: input.name.trim().slice(0, 120) || 'Public Workflow',
      description: input.description.trim().slice(0, 500),
      category: input.category.trim().slice(0, 40) || 'Automation',
      tags,
      graph,
      samplePayload,
      runsCount: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }

  return workflowId;
}

export async function incrementPublicWorkflowRun(workflowId: string): Promise<void> {
  const path = `publicWorkflows/${workflowId}`;
  try {
    await updateDoc(doc(db, 'publicWorkflows', workflowId), {
      runsCount: increment(1),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deletePublicCommunityWorkflow(workflowId: string): Promise<void> {
  const path = `publicWorkflows/${workflowId}`;
  try {
    await deleteDoc(doc(db, 'publicWorkflows', workflowId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}
