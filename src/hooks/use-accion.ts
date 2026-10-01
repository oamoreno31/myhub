"use client";

import { type FormEvent, startTransition, useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { type EstadoAccion, ESTADO_INICIAL } from "@/lib/acciones";

type Accion = (prev: EstadoAccion, formData: FormData) => Promise<EstadoAccion>;

/**
 * useActionState + toast de éxito/error + callback al guardar.
 *
 * Se envía con `onSubmit` (no con `<form action>`) para que React no reinicie
 * los campos cuando hay errores de validación: el usuario no pierde lo escrito.
 * `onExito` se llama una vez por envío exitoso (usa `marca`).
 */
export function useAccion(accion: Accion, onExito?: (estado: EstadoAccion) => void) {
  const [estado, ejecutar, pendiente] = useActionState(accion, ESTADO_INICIAL);
  const ultimaMarca = useRef<number | undefined>(undefined);
  const ultimoError = useRef<EstadoAccion | undefined>(undefined);
  const callback = useRef(onExito);

  useEffect(() => {
    callback.current = onExito;
  });

  useEffect(() => {
    if (estado.ok && estado.marca && estado.marca !== ultimaMarca.current) {
      ultimaMarca.current = estado.marca;
      if (estado.mensaje) toast.success(estado.mensaje);
      callback.current?.(estado);
    } else if (estado.ok === false && estado.error && ultimoError.current !== estado) {
      ultimoError.current = estado;
      toast.error(estado.error);
    }
  }, [estado]);

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const datos = new FormData(e.currentTarget);
    startTransition(() => ejecutar(datos));
  };

  return { estado, onSubmit, pendiente, errores: estado.errores ?? {} };
}
