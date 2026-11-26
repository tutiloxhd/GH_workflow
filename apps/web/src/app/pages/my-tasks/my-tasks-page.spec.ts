import { Component, input, output } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { WorkflowApiService } from '../../core/workflow/workflow-api.service';
import { TaskDialog } from '../workflow/task-dialog';
import { MyTasksPage } from './my-tasks-page';

@Component({ selector: 'app-task-dialog', template: '' })
class TaskDialogStub {
  readonly workflowId = input.required<number>();
  readonly taskId = input.required<number>();
  readonly fullscreenOnMobile = input(false);
  readonly closed = output<void>();
}

describe('MyTasksPage notification links', () => {
  it('opens the linked task and updates it when another notification is selected', async () => {
    const params = new BehaviorSubject(convertToParamMap({ workflow: '12', task: '34' }));
    const navigate = vi.fn().mockResolvedValue(true);
    TestBed.configureTestingModule({
      imports: [MyTasksPage],
      providers: [
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: params.value }, queryParamMap: params.asObservable() } },
        { provide: Router, useValue: { navigate } },
        { provide: WorkflowApiService, useValue: { listMyTasks: async () => ({ tasks: [], total: 0, metrics: { overdue: 0, today: 0, thisWeek: 0 } }) } },
      ],
    });
    TestBed.overrideComponent(MyTasksPage, {
      remove: { imports: [TaskDialog] },
      add: { imports: [TaskDialogStub] },
    });
    const fixture = TestBed.createComponent(MyTasksPage);
    await fixture.whenStable();
    let dialog = fixture.debugElement.query(By.directive(TaskDialogStub)).componentInstance as TaskDialogStub;
    expect(dialog.workflowId()).toBe(12);
    expect(dialog.taskId()).toBe(34);

    params.next(convertToParamMap({ workflow: '21', task: '43' }));
    await fixture.whenStable();
    dialog = fixture.debugElement.query(By.directive(TaskDialogStub)).componentInstance as TaskDialogStub;
    expect(dialog.workflowId()).toBe(21);
    expect(dialog.taskId()).toBe(43);

    dialog.closed.emit();
    await fixture.whenStable();
    expect(navigate).toHaveBeenCalledWith([], {
      relativeTo: TestBed.inject(ActivatedRoute),
      queryParams: { workflow: null, task: null },
      queryParamsHandling: 'merge',
    });
  });
});
