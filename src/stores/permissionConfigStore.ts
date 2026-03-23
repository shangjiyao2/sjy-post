import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PermissionConfigDraftRow, PermissionConfigFormState } from '../types/permission';

interface PermissionConfigState {
  activeProjectKey: string | null;
  projectForms: Record<string, PermissionConfigFormState>;
  form: PermissionConfigFormState;
  selectedEndpointIds: string[];
  generatedRows: PermissionConfigDraftRow[];
  selectedRowIds: string[];
  setActiveProjectForm: (projectKey: string | null) => void;
  setFormField: <K extends keyof PermissionConfigFormState>(field: K, value: PermissionConfigFormState[K]) => void;
  setSelectedEndpointIds: (ids: string[]) => void;
  setGeneratedRows: (rows: PermissionConfigDraftRow[]) => void;
  updateGeneratedRow: (id: string, patch: Partial<PermissionConfigDraftRow>) => void;
  updateAllGeneratedRows: (updater: (row: PermissionConfigDraftRow) => PermissionConfigDraftRow) => void;
  removeGeneratedRow: (id: string) => void;
  removeSelectedRows: () => void;
  setSelectedRowIds: (ids: string[]) => void;
  clearAll: () => void;
}

const initialForm: PermissionConfigFormState = {
  initialServCode: '',
  appId: '',
  createUser: '',
  updateUser: '',
  dbName: 'cgipca-td',
  tableName: 'ca_service',
};

export const buildDefaultForm = (form?: Partial<PermissionConfigFormState>): PermissionConfigFormState => ({
  ...initialForm,
  ...form,
});

const hasRowPatchDiff = (row: PermissionConfigDraftRow, patch: Partial<PermissionConfigDraftRow>) => {
  const patchKeys = Object.keys(patch) as Array<keyof PermissionConfigDraftRow>;
  return patchKeys.some((key) => row[key] !== patch[key]);
};

const applyRowPatch = (rows: PermissionConfigDraftRow[], id: string, patch: Partial<PermissionConfigDraftRow>) => {
  let changed = false;

  const nextRows = rows.map((row) => {
    if (row.id !== id || !hasRowPatchDiff(row, patch)) {
      return row;
    }

    changed = true;
    return { ...row, ...patch };
  });

  return { changed, nextRows };
};

const applyGeneratedRowsUpdate = (
  rows: PermissionConfigDraftRow[],
  updater: (row: PermissionConfigDraftRow) => PermissionConfigDraftRow,
) => {
  let changed = false;

  const nextRows = rows.map((row) => {
    const nextRow = updater(row);
    if (nextRow !== row) {
      changed = true;
    }
    return nextRow;
  });

  return { changed, nextRows };
};

export const usePermissionConfigStore = create<PermissionConfigState>()(
  persist(
    (set) => ({
      activeProjectKey: null,
      projectForms: {},
      form: buildDefaultForm(),
      selectedEndpointIds: [],
      generatedRows: [],
      selectedRowIds: [],
      setActiveProjectForm: (projectKey) => {
        set((state) => ({
          activeProjectKey: projectKey,
          form: projectKey ? buildDefaultForm(state.projectForms[projectKey]) : buildDefaultForm(),
        }));
      },
      setFormField: (field, value) => {
        set((state) => {
          const nextForm = { ...state.form, [field]: value };
          if (!state.activeProjectKey) {
            return { form: nextForm };
          }
          return {
            form: nextForm,
            projectForms: {
              ...state.projectForms,
              [state.activeProjectKey]: nextForm,
            },
          };
        });
      },
      setSelectedEndpointIds: (ids) => {
        set({ selectedEndpointIds: ids });
      },
      setGeneratedRows: (rows) => {
        set({ generatedRows: rows, selectedRowIds: [] });
      },
      updateGeneratedRow: (id, patch) => {
        set((state) => {
          const { changed, nextRows } = applyRowPatch(state.generatedRows, id, patch);
          return changed ? { generatedRows: nextRows } : state;
        });
      },
      updateAllGeneratedRows: (updater) => {
        set((state) => {
          const { changed, nextRows } = applyGeneratedRowsUpdate(state.generatedRows, updater);
          return changed ? { generatedRows: nextRows } : state;
        });
      },
      removeGeneratedRow: (id) => {
        set((state) => ({
          generatedRows: state.generatedRows.filter((row) => row.id !== id),
          selectedRowIds: state.selectedRowIds.filter((rowId) => rowId !== id),
        }));
      },
      removeSelectedRows: () => {
        set((state) => {
          const selected = new Set(state.selectedRowIds);
          return {
            generatedRows: state.generatedRows.filter((row) => !selected.has(row.id)),
            selectedRowIds: [],
          };
        });
      },
      setSelectedRowIds: (ids) => {
        set({ selectedRowIds: ids });
      },
      clearAll: () => {
        set({
          selectedEndpointIds: [],
          generatedRows: [],
          selectedRowIds: [],
        });
      },
    }),
    {
      name: 'sjypost-permission-config',
      partialize: (state) => ({
        projectForms: state.projectForms,
      }),
    },
  ),
);

