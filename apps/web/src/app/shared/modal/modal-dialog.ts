import { Directive, ElementRef, inject, output, type AfterViewInit } from '@angular/core';

// Abre un <dialog> nativo como modal al mostrarse. El navegador atrapa el foco, lo devuelve al
// cerrar y cierra con Escape; `closed` avisa al componente padre para que lo retire.
@Directive({
  selector: 'dialog[appModalDialog]',
  host: { class: 'modal', '(close)': 'closed.emit()' },
})
export class ModalDialog implements AfterViewInit {
  private readonly dialog = inject<ElementRef<HTMLDialogElement>>(ElementRef);
  readonly closed = output();

  ngAfterViewInit(): void {
    this.dialog.nativeElement.showModal();
  }

  close(): void {
    this.dialog.nativeElement.close();
  }
}
