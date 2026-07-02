import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as listWorkspaceProjects from './list-workspace-projects.js';
import * as addWorkspaceProject from './add-workspace-project.js';
import * as removeWorkspaceProject from './remove-workspace-project.js';
import { EngineContext } from './types.js';
import { CollectionManager } from '../../engine/collection-manager.js';
import { AuthManager } from '../../engine/auth-manager.js';

describe('Workspace Projects Tools', () => {
  let context: EngineContext;
  let getWorkspaceProjectsMock: any;
  let addWorkspaceProjectMock: any;
  let removeWorkspaceProjectMock: any;
  let getBaseDirMock: any;

  beforeEach(() => {
    getWorkspaceProjectsMock = vi.fn().mockResolvedValue(['/foo/bar', '/baz/qux']);
    addWorkspaceProjectMock = vi.fn().mockResolvedValue(undefined);
    removeWorkspaceProjectMock = vi.fn().mockResolvedValue(undefined);
    getBaseDirMock = vi.fn().mockReturnValue('/active/project/.reqly');

    context = {
      collectionManager: {
        getBaseDir: getBaseDirMock
      } as unknown as CollectionManager,
      authManager: {
        getWorkspaceProjects: getWorkspaceProjectsMock,
        addWorkspaceProject: addWorkspaceProjectMock,
        removeWorkspaceProject: removeWorkspaceProjectMock
      } as unknown as AuthManager
    } as EngineContext;
  });

  describe('list_workspace_projects', () => {
    it('returns the active project and configured projects', async () => {
      const result = await listWorkspaceProjects.handler({}, context);
      const data = JSON.parse((result.content[0] as any).text);
      expect(data.projects).toHaveLength(3);
      expect(data.projects[0].path).toBe('/active/project');
      expect(data.projects[1].path).toBe('/foo/bar');
      expect(data.projects[2].path).toBe('/baz/qux');
    });
  });

  describe('add_workspace_project', () => {
    it('calls authManager.addWorkspaceProject', async () => {
      const result = await addWorkspaceProject.handler({ path: '/new/project' }, context);
      expect(addWorkspaceProjectMock).toHaveBeenCalledWith('/new/project');
      expect((result.content[0] as any).text).toContain('/new/project');
    });
  });

  describe('remove_workspace_project', () => {
    it('calls authManager.removeWorkspaceProject', async () => {
      const result = await removeWorkspaceProject.handler({ path: '/old/project' }, context);
      expect(removeWorkspaceProjectMock).toHaveBeenCalledWith('/old/project');
      expect((result.content[0] as any).text).toContain('/old/project');
    });
  });
});
