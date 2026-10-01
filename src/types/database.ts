
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "bitacora": {
                  Row: {
                    "accion": string,"creado_en": string,"detalle": Json | null,"entidad": string,"entidad_id": string | null,"id": string,"user_id": string
                  }
                  Insert: {
                    "accion": string,"creado_en"?: string,"detalle"?: Json | null,"entidad": string,"entidad_id"?: string | null,"id"?: string,"user_id"?: string
                  }
                  Update: {
                    "accion"?: string,"creado_en"?: string,"detalle"?: Json | null,"entidad"?: string,"entidad_id"?: string | null,"id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"categorias": {
                  Row: {
                    "activa": boolean,"bolsa": Database["public"]['Enums']["bolsa_503020"],"color": string | null,"created_at": string,"es_fija": boolean,"es_sistema": boolean,"grupo": string,"icono": string | null,"id": string,"nombre": string,"orden": number,"padre_id": string | null,"requiere_descripcion": boolean,"tipo": Database["public"]['Enums']["tipo_categoria"],"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "activa"?: boolean,"bolsa"?: Database["public"]['Enums']["bolsa_503020"],"color"?: string | null,"created_at"?: string,"es_fija"?: boolean,"es_sistema"?: boolean,"grupo": string,"icono"?: string | null,"id"?: string,"nombre": string,"orden"?: number,"padre_id"?: string | null,"requiere_descripcion"?: boolean,"tipo": Database["public"]['Enums']["tipo_categoria"],"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "activa"?: boolean,"bolsa"?: Database["public"]['Enums']["bolsa_503020"],"color"?: string | null,"created_at"?: string,"es_fija"?: boolean,"es_sistema"?: boolean,"grupo"?: string,"icono"?: string | null,"id"?: string,"nombre"?: string,"orden"?: number,"padre_id"?: string | null,"requiere_descripcion"?: boolean,"tipo"?: Database["public"]['Enums']["tipo_categoria"],"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "categorias_padre_id_fkey"
      columns: ["padre_id"]
isOneToOne: false
      referencedRelation: "categorias"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "categorias_padre_id_fkey"
      columns: ["padre_id"]
isOneToOne: false
      referencedRelation: "v_consumo_mes"
      referencedColumns: ["categoria_id"]
    },{
      foreignKeyName: "categorias_padre_id_fkey"
      columns: ["padre_id"]
isOneToOne: false
      referencedRelation: "v_gasto_categoria_mes"
      referencedColumns: ["categoria_id"]
    },{
      foreignKeyName: "categorias_padre_id_fkey"
      columns: ["padre_id"]
isOneToOne: false
      referencedRelation: "v_gasto_categoria_mes"
      referencedColumns: ["padre_id"]
    }
                  ]
                },"compras_tc": {
                  Row: {
                    "adjunto_path": string | null,"categoria_id": string | null,"comercio": string | null,"created_at": string,"cuenta_destino_id": string | null,"descripcion": string | null,"fecha": string,"id": string,"moneda": string,"monto": number,"monto_origen": number | null,"num_cuotas": number,"periodo_id": string,"reembolsable": boolean,"reembolsado_por_id": string | null,"tarjeta_id": string,"tipo": Database["public"]['Enums']["tipo_compra_tc"],"trm": number | null,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "adjunto_path"?: string | null,"categoria_id"?: string | null,"comercio"?: string | null,"created_at"?: string,"cuenta_destino_id"?: string | null,"descripcion"?: string | null,"fecha": string,"id"?: string,"moneda"?: string,"monto": number,"monto_origen"?: number | null,"num_cuotas"?: number,"periodo_id": string,"reembolsable"?: boolean,"reembolsado_por_id"?: string | null,"tarjeta_id": string,"tipo"?: Database["public"]['Enums']["tipo_compra_tc"],"trm"?: number | null,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "adjunto_path"?: string | null,"categoria_id"?: string | null,"comercio"?: string | null,"created_at"?: string,"cuenta_destino_id"?: string | null,"descripcion"?: string | null,"fecha"?: string,"id"?: string,"moneda"?: string,"monto"?: number,"monto_origen"?: number | null,"num_cuotas"?: number,"periodo_id"?: string,"reembolsable"?: boolean,"reembolsado_por_id"?: string | null,"tarjeta_id"?: string,"tipo"?: Database["public"]['Enums']["tipo_compra_tc"],"trm"?: number | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "compras_tc_categoria_id_fkey"
      columns: ["categoria_id"]
isOneToOne: false
      referencedRelation: "categorias"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "compras_tc_categoria_id_fkey"
      columns: ["categoria_id"]
isOneToOne: false
      referencedRelation: "v_consumo_mes"
      referencedColumns: ["categoria_id"]
    },{
      foreignKeyName: "compras_tc_categoria_id_fkey"
      columns: ["categoria_id"]
isOneToOne: false
      referencedRelation: "v_gasto_categoria_mes"
      referencedColumns: ["categoria_id"]
    },{
      foreignKeyName: "compras_tc_categoria_id_fkey"
      columns: ["categoria_id"]
isOneToOne: false
      referencedRelation: "v_gasto_categoria_mes"
      referencedColumns: ["padre_id"]
    },{
      foreignKeyName: "compras_tc_cuenta_destino_id_fkey"
      columns: ["cuenta_destino_id"]
isOneToOne: false
      referencedRelation: "cuentas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "compras_tc_cuenta_destino_id_fkey"
      columns: ["cuenta_destino_id"]
isOneToOne: false
      referencedRelation: "v_saldos_cuentas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "compras_tc_periodo_id_fkey"
      columns: ["periodo_id"]
isOneToOne: false
      referencedRelation: "periodos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "compras_tc_periodo_id_fkey"
      columns: ["periodo_id"]
isOneToOne: false
      referencedRelation: "v_resumen_periodo"
      referencedColumns: ["periodo_id"]
    },{
      foreignKeyName: "compras_tc_reembolsado_por_id_fkey"
      columns: ["reembolsado_por_id"]
isOneToOne: false
      referencedRelation: "movimientos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "compras_tc_reembolsado_por_id_fkey"
      columns: ["reembolsado_por_id"]
isOneToOne: false
      referencedRelation: "v_movimientos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "compras_tc_reembolsado_por_id_fkey"
      columns: ["reembolsado_por_id"]
isOneToOne: false
      referencedRelation: "v_reembolsos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "compras_tc_tarjeta_id_fkey"
      columns: ["tarjeta_id"]
isOneToOne: false
      referencedRelation: "tarjetas_credito"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "compras_tc_tarjeta_id_fkey"
      columns: ["tarjeta_id"]
isOneToOne: false
      referencedRelation: "v_estado_tarjetas"
      referencedColumns: ["id"]
    }
                  ]
                },"cuentas": {
                  Row: {
                    "activa": boolean,"color": string | null,"created_at": string,"entidad": string | null,"fecha_saldo_inicial": string | null,"id": string,"nombre": string,"orden": number,"saldo_inicial": number,"tipo": Database["public"]['Enums']["tipo_cuenta"],"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "activa"?: boolean,"color"?: string | null,"created_at"?: string,"entidad"?: string | null,"fecha_saldo_inicial"?: string | null,"id"?: string,"nombre": string,"orden"?: number,"saldo_inicial"?: number,"tipo": Database["public"]['Enums']["tipo_cuenta"],"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "activa"?: boolean,"color"?: string | null,"created_at"?: string,"entidad"?: string | null,"fecha_saldo_inicial"?: string | null,"id"?: string,"nombre"?: string,"orden"?: number,"saldo_inicial"?: number,"tipo"?: Database["public"]['Enums']["tipo_cuenta"],"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"deudas": {
                  Row: {
                    "acreedor": string | null,"activa": boolean,"aporte_mensual": number,"created_at": string,"cuenta_aportes_id": string | null,"cuenta_desembolso_id": string | null,"cuenta_pago_default_id": string | null,"cuota": number,"dia_pago": number,"fecha_desembolso": string,"fecha_saldo_inicial": string,"id": string,"monto_original": number,"movimiento_desembolso_id": string | null,"nombre": string,"notas": string | null,"plazo_meses": number,"saldo_inicial": number,"seguro_mensual": number,"tasa_ea": number,"tipo": Database["public"]['Enums']["tipo_deuda"],"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "acreedor"?: string | null,"activa"?: boolean,"aporte_mensual"?: number,"created_at"?: string,"cuenta_aportes_id"?: string | null,"cuenta_desembolso_id"?: string | null,"cuenta_pago_default_id"?: string | null,"cuota": number,"dia_pago": number,"fecha_desembolso": string,"fecha_saldo_inicial": string,"id"?: string,"monto_original": number,"movimiento_desembolso_id"?: string | null,"nombre": string,"notas"?: string | null,"plazo_meses": number,"saldo_inicial": number,"seguro_mensual"?: number,"tasa_ea"?: number,"tipo"?: Database["public"]['Enums']["tipo_deuda"],"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "acreedor"?: string | null,"activa"?: boolean,"aporte_mensual"?: number,"created_at"?: string,"cuenta_aportes_id"?: string | null,"cuenta_desembolso_id"?: string | null,"cuenta_pago_default_id"?: string | null,"cuota"?: number,"dia_pago"?: number,"fecha_desembolso"?: string,"fecha_saldo_inicial"?: string,"id"?: string,"monto_original"?: number,"movimiento_desembolso_id"?: string | null,"nombre"?: string,"notas"?: string | null,"plazo_meses"?: number,"saldo_inicial"?: number,"seguro_mensual"?: number,"tasa_ea"?: number,"tipo"?: Database["public"]['Enums']["tipo_deuda"],"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "deudas_cuenta_aportes_id_fkey"
      columns: ["cuenta_aportes_id"]
isOneToOne: false
      referencedRelation: "cuentas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "deudas_cuenta_aportes_id_fkey"
      columns: ["cuenta_aportes_id"]
isOneToOne: false
      referencedRelation: "v_saldos_cuentas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "deudas_cuenta_desembolso_id_fkey"
      columns: ["cuenta_desembolso_id"]
isOneToOne: false
      referencedRelation: "cuentas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "deudas_cuenta_desembolso_id_fkey"
      columns: ["cuenta_desembolso_id"]
isOneToOne: false
      referencedRelation: "v_saldos_cuentas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "deudas_cuenta_pago_default_id_fkey"
      columns: ["cuenta_pago_default_id"]
isOneToOne: false
      referencedRelation: "cuentas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "deudas_cuenta_pago_default_id_fkey"
      columns: ["cuenta_pago_default_id"]
isOneToOne: false
      referencedRelation: "v_saldos_cuentas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "deudas_movimiento_desembolso_id_fkey"
      columns: ["movimiento_desembolso_id"]
isOneToOne: true
      referencedRelation: "movimientos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "deudas_movimiento_desembolso_id_fkey"
      columns: ["movimiento_desembolso_id"]
isOneToOne: true
      referencedRelation: "v_movimientos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "deudas_movimiento_desembolso_id_fkey"
      columns: ["movimiento_desembolso_id"]
isOneToOne: true
      referencedRelation: "v_reembolsos"
      referencedColumns: ["id"]
    }
                  ]
                },"extractos_tc": {
                  Row: {
                    "alerta": string | null,"capital_facturado": number | null,"created_at": string,"cuota_manejo": number | null,"diferencia_no_explicada": number | null,"estado": Database["public"]['Enums']["estado_extracto"],"fecha_corte": string,"fecha_limite_pago": string,"id": string,"intereses": number | null,"minimo_estimado": number | null,"otros_declarados": number | null,"otros_generados": number | null,"pagado": number,"pago_minimo_banco": number,"pago_total_banco": number,"periodo_id": string,"saldo_sistema_al_corte": number | null,"seguros": number | null,"tarjeta_id": string,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "alerta"?: string | null,"capital_facturado"?: number | null,"created_at"?: string,"cuota_manejo"?: number | null,"diferencia_no_explicada"?: number | null,"estado"?: Database["public"]['Enums']["estado_extracto"],"fecha_corte": string,"fecha_limite_pago": string,"id"?: string,"intereses"?: number | null,"minimo_estimado"?: number | null,"otros_declarados"?: number | null,"otros_generados"?: number | null,"pagado"?: number,"pago_minimo_banco": number,"pago_total_banco": number,"periodo_id": string,"saldo_sistema_al_corte"?: number | null,"seguros"?: number | null,"tarjeta_id": string,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "alerta"?: string | null,"capital_facturado"?: number | null,"created_at"?: string,"cuota_manejo"?: number | null,"diferencia_no_explicada"?: number | null,"estado"?: Database["public"]['Enums']["estado_extracto"],"fecha_corte"?: string,"fecha_limite_pago"?: string,"id"?: string,"intereses"?: number | null,"minimo_estimado"?: number | null,"otros_declarados"?: number | null,"otros_generados"?: number | null,"pagado"?: number,"pago_minimo_banco"?: number,"pago_total_banco"?: number,"periodo_id"?: string,"saldo_sistema_al_corte"?: number | null,"seguros"?: number | null,"tarjeta_id"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "extractos_tc_periodo_id_fkey"
      columns: ["periodo_id"]
isOneToOne: false
      referencedRelation: "periodos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "extractos_tc_periodo_id_fkey"
      columns: ["periodo_id"]
isOneToOne: false
      referencedRelation: "v_resumen_periodo"
      referencedColumns: ["periodo_id"]
    },{
      foreignKeyName: "extractos_tc_tarjeta_id_fkey"
      columns: ["tarjeta_id"]
isOneToOne: false
      referencedRelation: "tarjetas_credito"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "extractos_tc_tarjeta_id_fkey"
      columns: ["tarjeta_id"]
isOneToOne: false
      referencedRelation: "v_estado_tarjetas"
      referencedColumns: ["id"]
    }
                  ]
                },"metas": {
                  Row: {
                    "activa": boolean,"aporte_mensual": number | null,"created_at": string,"cuenta_id": string | null,"deuda_id": string | null,"fecha_objetivo": string | null,"id": string,"monto_objetivo": number,"nombre": string,"notas": string | null,"tipo": Database["public"]['Enums']["tipo_meta"],"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "activa"?: boolean,"aporte_mensual"?: number | null,"created_at"?: string,"cuenta_id"?: string | null,"deuda_id"?: string | null,"fecha_objetivo"?: string | null,"id"?: string,"monto_objetivo": number,"nombre": string,"notas"?: string | null,"tipo": Database["public"]['Enums']["tipo_meta"],"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "activa"?: boolean,"aporte_mensual"?: number | null,"created_at"?: string,"cuenta_id"?: string | null,"deuda_id"?: string | null,"fecha_objetivo"?: string | null,"id"?: string,"monto_objetivo"?: number,"nombre"?: string,"notas"?: string | null,"tipo"?: Database["public"]['Enums']["tipo_meta"],"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "metas_cuenta_id_fkey"
      columns: ["cuenta_id"]
isOneToOne: false
      referencedRelation: "cuentas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "metas_cuenta_id_fkey"
      columns: ["cuenta_id"]
isOneToOne: false
      referencedRelation: "v_saldos_cuentas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "metas_deuda_id_fkey"
      columns: ["deuda_id"]
isOneToOne: false
      referencedRelation: "deudas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "metas_deuda_id_fkey"
      columns: ["deuda_id"]
isOneToOne: false
      referencedRelation: "v_estado_deudas"
      referencedColumns: ["id"]
    }
                  ]
                },"movimientos": {
                  Row: {
                    "adjunto_path": string | null,"categoria_id": string | null,"comercio": string | null,"created_at": string,"cuenta_destino_id": string | null,"cuenta_id": string,"descripcion": string | null,"etiquetas": (string)[],"fecha": string,"id": string,"monto": number,"obligacion_periodo_id": string | null,"periodo_id": string,"prestamo_otorgado_id": string | null,"reembolsable": boolean,"reembolsado_por_id": string | null,"tipo": Database["public"]['Enums']["tipo_movimiento"],"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "adjunto_path"?: string | null,"categoria_id"?: string | null,"comercio"?: string | null,"created_at"?: string,"cuenta_destino_id"?: string | null,"cuenta_id": string,"descripcion"?: string | null,"etiquetas"?: (string)[],"fecha": string,"id"?: string,"monto": number,"obligacion_periodo_id"?: string | null,"periodo_id": string,"prestamo_otorgado_id"?: string | null,"reembolsable"?: boolean,"reembolsado_por_id"?: string | null,"tipo": Database["public"]['Enums']["tipo_movimiento"],"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "adjunto_path"?: string | null,"categoria_id"?: string | null,"comercio"?: string | null,"created_at"?: string,"cuenta_destino_id"?: string | null,"cuenta_id"?: string,"descripcion"?: string | null,"etiquetas"?: (string)[],"fecha"?: string,"id"?: string,"monto"?: number,"obligacion_periodo_id"?: string | null,"periodo_id"?: string,"prestamo_otorgado_id"?: string | null,"reembolsable"?: boolean,"reembolsado_por_id"?: string | null,"tipo"?: Database["public"]['Enums']["tipo_movimiento"],"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "movimientos_categoria_id_fkey"
      columns: ["categoria_id"]
isOneToOne: false
      referencedRelation: "categorias"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "movimientos_categoria_id_fkey"
      columns: ["categoria_id"]
isOneToOne: false
      referencedRelation: "v_consumo_mes"
      referencedColumns: ["categoria_id"]
    },{
      foreignKeyName: "movimientos_categoria_id_fkey"
      columns: ["categoria_id"]
isOneToOne: false
      referencedRelation: "v_gasto_categoria_mes"
      referencedColumns: ["categoria_id"]
    },{
      foreignKeyName: "movimientos_categoria_id_fkey"
      columns: ["categoria_id"]
isOneToOne: false
      referencedRelation: "v_gasto_categoria_mes"
      referencedColumns: ["padre_id"]
    },{
      foreignKeyName: "movimientos_cuenta_destino_id_fkey"
      columns: ["cuenta_destino_id"]
isOneToOne: false
      referencedRelation: "cuentas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "movimientos_cuenta_destino_id_fkey"
      columns: ["cuenta_destino_id"]
isOneToOne: false
      referencedRelation: "v_saldos_cuentas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "movimientos_cuenta_id_fkey"
      columns: ["cuenta_id"]
isOneToOne: false
      referencedRelation: "cuentas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "movimientos_cuenta_id_fkey"
      columns: ["cuenta_id"]
isOneToOne: false
      referencedRelation: "v_saldos_cuentas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "movimientos_obligacion_periodo_id_fkey"
      columns: ["obligacion_periodo_id"]
isOneToOne: false
      referencedRelation: "obligaciones_periodo"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "movimientos_obligacion_periodo_id_fkey"
      columns: ["obligacion_periodo_id"]
isOneToOne: false
      referencedRelation: "v_obligaciones_mes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "movimientos_periodo_id_fkey"
      columns: ["periodo_id"]
isOneToOne: false
      referencedRelation: "periodos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "movimientos_periodo_id_fkey"
      columns: ["periodo_id"]
isOneToOne: false
      referencedRelation: "v_resumen_periodo"
      referencedColumns: ["periodo_id"]
    },{
      foreignKeyName: "movimientos_prestamo_otorgado_id_fkey"
      columns: ["prestamo_otorgado_id"]
isOneToOne: false
      referencedRelation: "prestamos_otorgados"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "movimientos_prestamo_otorgado_id_fkey"
      columns: ["prestamo_otorgado_id"]
isOneToOne: false
      referencedRelation: "v_prestamos_otorgados"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "movimientos_reembolsado_por_id_fkey"
      columns: ["reembolsado_por_id"]
isOneToOne: false
      referencedRelation: "movimientos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "movimientos_reembolsado_por_id_fkey"
      columns: ["reembolsado_por_id"]
isOneToOne: false
      referencedRelation: "v_movimientos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "movimientos_reembolsado_por_id_fkey"
      columns: ["reembolsado_por_id"]
isOneToOne: false
      referencedRelation: "v_reembolsos"
      referencedColumns: ["id"]
    }
                  ]
                },"obligaciones": {
                  Row: {
                    "activa": boolean,"categoria_id": string,"created_at": string,"cuenta_default_id": string | null,"deuda_id": string | null,"dia_vencimiento": number,"es_ingreso": boolean | null,"es_variable": boolean,"estimar_con_promedio": boolean,"fecha_fin": string | null,"fecha_inicio": string,"frecuencia": Database["public"]['Enums']["frecuencia"],"id": string,"mes_ancla": string | null,"monto_estimado": number,"nombre": string,"notas": string | null,"orden": number,"referencia_pago": string | null,"tipo": Database["public"]['Enums']["tipo_obligacion"],"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "activa"?: boolean,"categoria_id": string,"created_at"?: string,"cuenta_default_id"?: string | null,"deuda_id"?: string | null,"dia_vencimiento": number,"es_ingreso"?: never,"es_variable"?: boolean,"estimar_con_promedio"?: boolean,"fecha_fin"?: string | null,"fecha_inicio"?: string,"frecuencia"?: Database["public"]['Enums']["frecuencia"],"id"?: string,"mes_ancla"?: string | null,"monto_estimado"?: number,"nombre": string,"notas"?: string | null,"orden"?: number,"referencia_pago"?: string | null,"tipo": Database["public"]['Enums']["tipo_obligacion"],"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "activa"?: boolean,"categoria_id"?: string,"created_at"?: string,"cuenta_default_id"?: string | null,"deuda_id"?: string | null,"dia_vencimiento"?: number,"es_ingreso"?: never,"es_variable"?: boolean,"estimar_con_promedio"?: boolean,"fecha_fin"?: string | null,"fecha_inicio"?: string,"frecuencia"?: Database["public"]['Enums']["frecuencia"],"id"?: string,"mes_ancla"?: string | null,"monto_estimado"?: number,"nombre"?: string,"notas"?: string | null,"orden"?: number,"referencia_pago"?: string | null,"tipo"?: Database["public"]['Enums']["tipo_obligacion"],"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "obligaciones_categoria_id_fkey"
      columns: ["categoria_id"]
isOneToOne: false
      referencedRelation: "categorias"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "obligaciones_categoria_id_fkey"
      columns: ["categoria_id"]
isOneToOne: false
      referencedRelation: "v_consumo_mes"
      referencedColumns: ["categoria_id"]
    },{
      foreignKeyName: "obligaciones_categoria_id_fkey"
      columns: ["categoria_id"]
isOneToOne: false
      referencedRelation: "v_gasto_categoria_mes"
      referencedColumns: ["categoria_id"]
    },{
      foreignKeyName: "obligaciones_categoria_id_fkey"
      columns: ["categoria_id"]
isOneToOne: false
      referencedRelation: "v_gasto_categoria_mes"
      referencedColumns: ["padre_id"]
    },{
      foreignKeyName: "obligaciones_cuenta_default_id_fkey"
      columns: ["cuenta_default_id"]
isOneToOne: false
      referencedRelation: "cuentas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "obligaciones_cuenta_default_id_fkey"
      columns: ["cuenta_default_id"]
isOneToOne: false
      referencedRelation: "v_saldos_cuentas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "obligaciones_deuda_id_fkey"
      columns: ["deuda_id"]
isOneToOne: true
      referencedRelation: "deudas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "obligaciones_deuda_id_fkey"
      columns: ["deuda_id"]
isOneToOne: true
      referencedRelation: "v_estado_deudas"
      referencedColumns: ["id"]
    }
                  ]
                },"obligaciones_periodo": {
                  Row: {
                    "arrastrada_de_id": string | null,"categoria_id": string,"created_at": string,"cuenta_default_id": string | null,"es_ingreso": boolean | null,"extracto_id": string | null,"fecha_vencimiento": string,"id": string,"monto_esperado": number,"motivo": string | null,"nombre": string,"nota": string | null,"obligacion_id": string | null,"periodo_id": string,"resolucion": string | null,"tipo": Database["public"]['Enums']["tipo_obligacion"],"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "arrastrada_de_id"?: string | null,"categoria_id": string,"created_at"?: string,"cuenta_default_id"?: string | null,"es_ingreso"?: never,"extracto_id"?: string | null,"fecha_vencimiento": string,"id"?: string,"monto_esperado"?: number,"motivo"?: string | null,"nombre": string,"nota"?: string | null,"obligacion_id"?: string | null,"periodo_id": string,"resolucion"?: string | null,"tipo": Database["public"]['Enums']["tipo_obligacion"],"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "arrastrada_de_id"?: string | null,"categoria_id"?: string,"created_at"?: string,"cuenta_default_id"?: string | null,"es_ingreso"?: never,"extracto_id"?: string | null,"fecha_vencimiento"?: string,"id"?: string,"monto_esperado"?: number,"motivo"?: string | null,"nombre"?: string,"nota"?: string | null,"obligacion_id"?: string | null,"periodo_id"?: string,"resolucion"?: string | null,"tipo"?: Database["public"]['Enums']["tipo_obligacion"],"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "obligaciones_periodo_arrastrada_de_id_fkey"
      columns: ["arrastrada_de_id"]
isOneToOne: false
      referencedRelation: "obligaciones_periodo"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "obligaciones_periodo_arrastrada_de_id_fkey"
      columns: ["arrastrada_de_id"]
isOneToOne: false
      referencedRelation: "v_obligaciones_mes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "obligaciones_periodo_categoria_id_fkey"
      columns: ["categoria_id"]
isOneToOne: false
      referencedRelation: "categorias"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "obligaciones_periodo_categoria_id_fkey"
      columns: ["categoria_id"]
isOneToOne: false
      referencedRelation: "v_consumo_mes"
      referencedColumns: ["categoria_id"]
    },{
      foreignKeyName: "obligaciones_periodo_categoria_id_fkey"
      columns: ["categoria_id"]
isOneToOne: false
      referencedRelation: "v_gasto_categoria_mes"
      referencedColumns: ["categoria_id"]
    },{
      foreignKeyName: "obligaciones_periodo_categoria_id_fkey"
      columns: ["categoria_id"]
isOneToOne: false
      referencedRelation: "v_gasto_categoria_mes"
      referencedColumns: ["padre_id"]
    },{
      foreignKeyName: "obligaciones_periodo_cuenta_default_id_fkey"
      columns: ["cuenta_default_id"]
isOneToOne: false
      referencedRelation: "cuentas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "obligaciones_periodo_cuenta_default_id_fkey"
      columns: ["cuenta_default_id"]
isOneToOne: false
      referencedRelation: "v_saldos_cuentas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "obligaciones_periodo_extracto_id_fkey"
      columns: ["extracto_id"]
isOneToOne: true
      referencedRelation: "extractos_tc"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "obligaciones_periodo_extracto_id_fkey"
      columns: ["extracto_id"]
isOneToOne: true
      referencedRelation: "v_estado_tarjetas"
      referencedColumns: ["ultimo_extracto_id"]
    },{
      foreignKeyName: "obligaciones_periodo_obligacion_id_fkey"
      columns: ["obligacion_id"]
isOneToOne: false
      referencedRelation: "obligaciones"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "obligaciones_periodo_obligacion_id_fkey"
      columns: ["obligacion_id"]
isOneToOne: false
      referencedRelation: "v_estado_deudas"
      referencedColumns: ["obligacion_id"]
    },{
      foreignKeyName: "obligaciones_periodo_periodo_id_fkey"
      columns: ["periodo_id"]
isOneToOne: false
      referencedRelation: "periodos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "obligaciones_periodo_periodo_id_fkey"
      columns: ["periodo_id"]
isOneToOne: false
      referencedRelation: "v_resumen_periodo"
      referencedColumns: ["periodo_id"]
    }
                  ]
                },"pagos_deuda": {
                  Row: {
                    "a_aporte": number,"a_capital": number,"a_intereses": number,"a_seguros": number,"created_at": string,"cuenta_origen_id": string,"deuda_id": string,"fecha": string,"id": string,"monto": number,"movimiento_aporte_id": string | null,"movimiento_id": string | null,"nota": string | null,"obligacion_periodo_id": string | null,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "a_aporte"?: number,"a_capital"?: number,"a_intereses"?: number,"a_seguros"?: number,"created_at"?: string,"cuenta_origen_id": string,"deuda_id": string,"fecha": string,"id"?: string,"monto": number,"movimiento_aporte_id"?: string | null,"movimiento_id"?: string | null,"nota"?: string | null,"obligacion_periodo_id"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "a_aporte"?: number,"a_capital"?: number,"a_intereses"?: number,"a_seguros"?: number,"created_at"?: string,"cuenta_origen_id"?: string,"deuda_id"?: string,"fecha"?: string,"id"?: string,"monto"?: number,"movimiento_aporte_id"?: string | null,"movimiento_id"?: string | null,"nota"?: string | null,"obligacion_periodo_id"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "pagos_deuda_cuenta_origen_id_fkey"
      columns: ["cuenta_origen_id"]
isOneToOne: false
      referencedRelation: "cuentas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pagos_deuda_cuenta_origen_id_fkey"
      columns: ["cuenta_origen_id"]
isOneToOne: false
      referencedRelation: "v_saldos_cuentas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pagos_deuda_deuda_id_fkey"
      columns: ["deuda_id"]
isOneToOne: false
      referencedRelation: "deudas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pagos_deuda_deuda_id_fkey"
      columns: ["deuda_id"]
isOneToOne: false
      referencedRelation: "v_estado_deudas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pagos_deuda_movimiento_aporte_id_fkey"
      columns: ["movimiento_aporte_id"]
isOneToOne: true
      referencedRelation: "movimientos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pagos_deuda_movimiento_aporte_id_fkey"
      columns: ["movimiento_aporte_id"]
isOneToOne: true
      referencedRelation: "v_movimientos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pagos_deuda_movimiento_aporte_id_fkey"
      columns: ["movimiento_aporte_id"]
isOneToOne: true
      referencedRelation: "v_reembolsos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pagos_deuda_movimiento_id_fkey"
      columns: ["movimiento_id"]
isOneToOne: true
      referencedRelation: "movimientos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pagos_deuda_movimiento_id_fkey"
      columns: ["movimiento_id"]
isOneToOne: true
      referencedRelation: "v_movimientos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pagos_deuda_movimiento_id_fkey"
      columns: ["movimiento_id"]
isOneToOne: true
      referencedRelation: "v_reembolsos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pagos_deuda_obligacion_periodo_id_fkey"
      columns: ["obligacion_periodo_id"]
isOneToOne: false
      referencedRelation: "obligaciones_periodo"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pagos_deuda_obligacion_periodo_id_fkey"
      columns: ["obligacion_periodo_id"]
isOneToOne: false
      referencedRelation: "v_obligaciones_mes"
      referencedColumns: ["id"]
    }
                  ]
                },"pagos_tc": {
                  Row: {
                    "created_at": string,"cuenta_origen_id": string,"extracto_id": string | null,"fecha": string,"id": string,"imputado_capital": number,"imputado_otros": number,"monto": number,"movimiento_id": string | null,"nota": string | null,"saldo_a_favor": number,"tarjeta_id": string,"tipo_calculado": Database["public"]['Enums']["tipo_pago_tc"] | null,"tipo_elegido": Database["public"]['Enums']["tipo_pago_tc"],"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"cuenta_origen_id": string,"extracto_id"?: string | null,"fecha": string,"id"?: string,"imputado_capital"?: number,"imputado_otros"?: number,"monto": number,"movimiento_id"?: string | null,"nota"?: string | null,"saldo_a_favor"?: number,"tarjeta_id": string,"tipo_calculado"?: Database["public"]['Enums']["tipo_pago_tc"] | null,"tipo_elegido"?: Database["public"]['Enums']["tipo_pago_tc"],"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"cuenta_origen_id"?: string,"extracto_id"?: string | null,"fecha"?: string,"id"?: string,"imputado_capital"?: number,"imputado_otros"?: number,"monto"?: number,"movimiento_id"?: string | null,"nota"?: string | null,"saldo_a_favor"?: number,"tarjeta_id"?: string,"tipo_calculado"?: Database["public"]['Enums']["tipo_pago_tc"] | null,"tipo_elegido"?: Database["public"]['Enums']["tipo_pago_tc"],"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "pagos_tc_cuenta_origen_id_fkey"
      columns: ["cuenta_origen_id"]
isOneToOne: false
      referencedRelation: "cuentas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pagos_tc_cuenta_origen_id_fkey"
      columns: ["cuenta_origen_id"]
isOneToOne: false
      referencedRelation: "v_saldos_cuentas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pagos_tc_extracto_id_fkey"
      columns: ["extracto_id"]
isOneToOne: false
      referencedRelation: "extractos_tc"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pagos_tc_extracto_id_fkey"
      columns: ["extracto_id"]
isOneToOne: false
      referencedRelation: "v_estado_tarjetas"
      referencedColumns: ["ultimo_extracto_id"]
    },{
      foreignKeyName: "pagos_tc_movimiento_id_fkey"
      columns: ["movimiento_id"]
isOneToOne: true
      referencedRelation: "movimientos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pagos_tc_movimiento_id_fkey"
      columns: ["movimiento_id"]
isOneToOne: true
      referencedRelation: "v_movimientos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pagos_tc_movimiento_id_fkey"
      columns: ["movimiento_id"]
isOneToOne: true
      referencedRelation: "v_reembolsos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pagos_tc_tarjeta_id_fkey"
      columns: ["tarjeta_id"]
isOneToOne: false
      referencedRelation: "tarjetas_credito"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pagos_tc_tarjeta_id_fkey"
      columns: ["tarjeta_id"]
isOneToOne: false
      referencedRelation: "v_estado_tarjetas"
      referencedColumns: ["id"]
    }
                  ]
                },"parametros": {
                  Row: {
                    "created_at": string,"dia_inicio_mes": number,"imputacion_tc": string,"meta_ahorro_pct": number,"moneda": string,"recordatorios_email": boolean,"seguridad_social": NonNullable<Json>,"tasa_usura_ea": number | null,"umbral_conciliacion_abs": number,"umbral_conciliacion_pct": number,"umbrales_salud": NonNullable<Json>,"updated_at": string,"user_id": string,"zona_horaria": string
                  }
                  Insert: {
                    "created_at"?: string,"dia_inicio_mes"?: number,"imputacion_tc"?: string,"meta_ahorro_pct"?: number,"moneda"?: string,"recordatorios_email"?: boolean,"seguridad_social"?: NonNullable<Json>,"tasa_usura_ea"?: number | null,"umbral_conciliacion_abs"?: number,"umbral_conciliacion_pct"?: number,"umbrales_salud"?: NonNullable<Json>,"updated_at"?: string,"user_id"?: string,"zona_horaria"?: string
                  }
                  Update: {
                    "created_at"?: string,"dia_inicio_mes"?: number,"imputacion_tc"?: string,"meta_ahorro_pct"?: number,"moneda"?: string,"recordatorios_email"?: boolean,"seguridad_social"?: NonNullable<Json>,"tasa_usura_ea"?: number | null,"umbral_conciliacion_abs"?: number,"umbral_conciliacion_pct"?: number,"umbrales_salud"?: NonNullable<Json>,"updated_at"?: string,"user_id"?: string,"zona_horaria"?: string
                  }
                  Relationships: [
                    
                  ]
                },"periodos": {
                  Row: {
                    "cerrado_en": string | null,"created_at": string,"estado": Database["public"]['Enums']["estado_periodo"],"id": string,"mes": string,"notas": string | null,"reabierto_en": string | null,"snapshot": Json | null,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "cerrado_en"?: string | null,"created_at"?: string,"estado"?: Database["public"]['Enums']["estado_periodo"],"id"?: string,"mes": string,"notas"?: string | null,"reabierto_en"?: string | null,"snapshot"?: Json | null,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "cerrado_en"?: string | null,"created_at"?: string,"estado"?: Database["public"]['Enums']["estado_periodo"],"id"?: string,"mes"?: string,"notas"?: string | null,"reabierto_en"?: string | null,"snapshot"?: Json | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"prestamos_otorgados": {
                  Row: {
                    "castigado_en": string | null,"created_at": string,"cuenta_origen_id": string,"deudor": string,"fecha": string,"fecha_esperada": string | null,"id": string,"monto": number,"motivo_castigo": string | null,"movimiento_id": string | null,"notas": string | null,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "castigado_en"?: string | null,"created_at"?: string,"cuenta_origen_id": string,"deudor": string,"fecha": string,"fecha_esperada"?: string | null,"id"?: string,"monto": number,"motivo_castigo"?: string | null,"movimiento_id"?: string | null,"notas"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "castigado_en"?: string | null,"created_at"?: string,"cuenta_origen_id"?: string,"deudor"?: string,"fecha"?: string,"fecha_esperada"?: string | null,"id"?: string,"monto"?: number,"motivo_castigo"?: string | null,"movimiento_id"?: string | null,"notas"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "prestamos_otorgados_cuenta_origen_id_fkey"
      columns: ["cuenta_origen_id"]
isOneToOne: false
      referencedRelation: "cuentas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "prestamos_otorgados_cuenta_origen_id_fkey"
      columns: ["cuenta_origen_id"]
isOneToOne: false
      referencedRelation: "v_saldos_cuentas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "prestamos_otorgados_movimiento_id_fkey"
      columns: ["movimiento_id"]
isOneToOne: true
      referencedRelation: "movimientos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "prestamos_otorgados_movimiento_id_fkey"
      columns: ["movimiento_id"]
isOneToOne: true
      referencedRelation: "v_movimientos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "prestamos_otorgados_movimiento_id_fkey"
      columns: ["movimiento_id"]
isOneToOne: true
      referencedRelation: "v_reembolsos"
      referencedColumns: ["id"]
    }
                  ]
                },"presupuestos": {
                  Row: {
                    "categoria_id": string,"created_at": string,"id": string,"monto": number,"periodo_id": string | null,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "categoria_id": string,"created_at"?: string,"id"?: string,"monto": number,"periodo_id"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "categoria_id"?: string,"created_at"?: string,"id"?: string,"monto"?: number,"periodo_id"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "presupuestos_categoria_id_fkey"
      columns: ["categoria_id"]
isOneToOne: false
      referencedRelation: "categorias"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "presupuestos_categoria_id_fkey"
      columns: ["categoria_id"]
isOneToOne: false
      referencedRelation: "v_consumo_mes"
      referencedColumns: ["categoria_id"]
    },{
      foreignKeyName: "presupuestos_categoria_id_fkey"
      columns: ["categoria_id"]
isOneToOne: false
      referencedRelation: "v_gasto_categoria_mes"
      referencedColumns: ["categoria_id"]
    },{
      foreignKeyName: "presupuestos_categoria_id_fkey"
      columns: ["categoria_id"]
isOneToOne: false
      referencedRelation: "v_gasto_categoria_mes"
      referencedColumns: ["padre_id"]
    },{
      foreignKeyName: "presupuestos_periodo_id_fkey"
      columns: ["periodo_id"]
isOneToOne: false
      referencedRelation: "periodos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "presupuestos_periodo_id_fkey"
      columns: ["periodo_id"]
isOneToOne: false
      referencedRelation: "v_resumen_periodo"
      referencedColumns: ["periodo_id"]
    }
                  ]
                },"tarjetas_credito": {
                  Row: {
                    "activa": boolean,"created_at": string,"cuenta_id": string,"cuenta_pago_default_id": string | null,"cuota_manejo_ref": number | null,"cupo": number,"dia_corte": number,"dia_limite_pago": number,"franquicia": string,"id": string,"tasa_ea_ref": number | null,"ultimos4": string | null,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "activa"?: boolean,"created_at"?: string,"cuenta_id": string,"cuenta_pago_default_id"?: string | null,"cuota_manejo_ref"?: number | null,"cupo"?: number,"dia_corte": number,"dia_limite_pago": number,"franquicia"?: string,"id"?: string,"tasa_ea_ref"?: number | null,"ultimos4"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "activa"?: boolean,"created_at"?: string,"cuenta_id"?: string,"cuenta_pago_default_id"?: string | null,"cuota_manejo_ref"?: number | null,"cupo"?: number,"dia_corte"?: number,"dia_limite_pago"?: number,"franquicia"?: string,"id"?: string,"tasa_ea_ref"?: number | null,"ultimos4"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tarjetas_credito_cuenta_id_fkey"
      columns: ["cuenta_id"]
isOneToOne: true
      referencedRelation: "cuentas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tarjetas_credito_cuenta_id_fkey"
      columns: ["cuenta_id"]
isOneToOne: true
      referencedRelation: "v_saldos_cuentas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tarjetas_credito_cuenta_pago_default_id_fkey"
      columns: ["cuenta_pago_default_id"]
isOneToOne: false
      referencedRelation: "cuentas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tarjetas_credito_cuenta_pago_default_id_fkey"
      columns: ["cuenta_pago_default_id"]
isOneToOne: false
      referencedRelation: "v_saldos_cuentas"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "v_caja_mes": {
                  Row: {
                    "categoria_id": string | null,"concepto": string | null,"mes": string | null,"n": number | null,"periodo_id": string | null,"reembolsable": boolean | null,"tipo": Database["public"]['Enums']["tipo_movimiento"] | null,"total": number | null,"user_id": string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "movimientos_periodo_id_fkey"
      columns: ["periodo_id"]
isOneToOne: false
      referencedRelation: "periodos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "movimientos_periodo_id_fkey"
      columns: ["periodo_id"]
isOneToOne: false
      referencedRelation: "v_resumen_periodo"
      referencedColumns: ["periodo_id"]
    }
                  ]
                },"v_comercios_mes": {
                  Row: {
                    "clave": string | null,"comercio": string | null,"mes": string | null,"n": number | null,"periodo_id": string | null,"reembolsable": boolean | null,"total": number | null,"user_id": string | null
                  }
                  Relationships: [
                    
                  ]
                },"v_compras_tc": {
                  Row: {
                    "adjunto_path": string | null,"categoria_id": string | null,"categoria_nombre": string | null,"categoria_padre_id": string | null,"categoria_padre_nombre": string | null,"comercio": string | null,"created_at": string | null,"cuenta_destino_id": string | null,"cuenta_destino_nombre": string | null,"descripcion": string | null,"dia_corte": number | null,"estado_periodo": Database["public"]['Enums']["estado_periodo"] | null,"fecha": string | null,"id": string | null,"mes": string | null,"moneda": string | null,"monto": number | null,"monto_origen": number | null,"num_cuotas": number | null,"periodo_id": string | null,"primer_corte": string | null,"reembolsable": boolean | null,"reembolsado_por_id": string | null,"tarjeta_id": string | null,"tarjeta_nombre": string | null,"tipo": Database["public"]['Enums']["tipo_compra_tc"] | null,"trm": number | null,"user_id": string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "categorias_padre_id_fkey"
      columns: ["categoria_padre_id"]
isOneToOne: false
      referencedRelation: "categorias"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "categorias_padre_id_fkey"
      columns: ["categoria_padre_id"]
isOneToOne: false
      referencedRelation: "v_consumo_mes"
      referencedColumns: ["categoria_id"]
    },{
      foreignKeyName: "categorias_padre_id_fkey"
      columns: ["categoria_padre_id"]
isOneToOne: false
      referencedRelation: "v_gasto_categoria_mes"
      referencedColumns: ["categoria_id"]
    },{
      foreignKeyName: "categorias_padre_id_fkey"
      columns: ["categoria_padre_id"]
isOneToOne: false
      referencedRelation: "v_gasto_categoria_mes"
      referencedColumns: ["padre_id"]
    },{
      foreignKeyName: "compras_tc_categoria_id_fkey"
      columns: ["categoria_id"]
isOneToOne: false
      referencedRelation: "categorias"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "compras_tc_categoria_id_fkey"
      columns: ["categoria_id"]
isOneToOne: false
      referencedRelation: "v_consumo_mes"
      referencedColumns: ["categoria_id"]
    },{
      foreignKeyName: "compras_tc_categoria_id_fkey"
      columns: ["categoria_id"]
isOneToOne: false
      referencedRelation: "v_gasto_categoria_mes"
      referencedColumns: ["categoria_id"]
    },{
      foreignKeyName: "compras_tc_categoria_id_fkey"
      columns: ["categoria_id"]
isOneToOne: false
      referencedRelation: "v_gasto_categoria_mes"
      referencedColumns: ["padre_id"]
    },{
      foreignKeyName: "compras_tc_cuenta_destino_id_fkey"
      columns: ["cuenta_destino_id"]
isOneToOne: false
      referencedRelation: "cuentas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "compras_tc_cuenta_destino_id_fkey"
      columns: ["cuenta_destino_id"]
isOneToOne: false
      referencedRelation: "v_saldos_cuentas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "compras_tc_periodo_id_fkey"
      columns: ["periodo_id"]
isOneToOne: false
      referencedRelation: "periodos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "compras_tc_periodo_id_fkey"
      columns: ["periodo_id"]
isOneToOne: false
      referencedRelation: "v_resumen_periodo"
      referencedColumns: ["periodo_id"]
    },{
      foreignKeyName: "compras_tc_reembolsado_por_id_fkey"
      columns: ["reembolsado_por_id"]
isOneToOne: false
      referencedRelation: "movimientos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "compras_tc_reembolsado_por_id_fkey"
      columns: ["reembolsado_por_id"]
isOneToOne: false
      referencedRelation: "v_movimientos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "compras_tc_reembolsado_por_id_fkey"
      columns: ["reembolsado_por_id"]
isOneToOne: false
      referencedRelation: "v_reembolsos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "compras_tc_tarjeta_id_fkey"
      columns: ["tarjeta_id"]
isOneToOne: false
      referencedRelation: "tarjetas_credito"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "compras_tc_tarjeta_id_fkey"
      columns: ["tarjeta_id"]
isOneToOne: false
      referencedRelation: "v_estado_tarjetas"
      referencedColumns: ["id"]
    }
                  ]
                },"v_consumo_mes": {
                  Row: {
                    "bolsa": Database["public"]['Enums']["bolsa_503020"] | null,"categoria_id": string | null,"categoria_nombre": string | null,"es_fija": boolean | null,"estado_periodo": Database["public"]['Enums']["estado_periodo"] | null,"grupo": string | null,"mes": string | null,"n": number | null,"origen": string | null,"padre_id": string | null,"padre_nombre": string | null,"periodo_id": string | null,"raiz_id": string | null,"reembolsable": boolean | null,"total": number | null,"user_id": string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "categorias_padre_id_fkey"
      columns: ["padre_id"]
isOneToOne: false
      referencedRelation: "categorias"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "categorias_padre_id_fkey"
      columns: ["padre_id"]
isOneToOne: false
      referencedRelation: "v_consumo_mes"
      referencedColumns: ["categoria_id"]
    },{
      foreignKeyName: "categorias_padre_id_fkey"
      columns: ["padre_id"]
isOneToOne: false
      referencedRelation: "v_gasto_categoria_mes"
      referencedColumns: ["categoria_id"]
    },{
      foreignKeyName: "categorias_padre_id_fkey"
      columns: ["padre_id"]
isOneToOne: false
      referencedRelation: "v_gasto_categoria_mes"
      referencedColumns: ["padre_id"]
    }
                  ]
                },"v_cuotas_tc": {
                  Row: {
                    "comercio": string | null,"compra_id": string | null,"corte": string | null,"descripcion": string | null,"fecha": string | null,"num_cuotas": number | null,"numero": number | null,"tarjeta_id": string | null,"user_id": string | null,"valor": number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "compras_tc_tarjeta_id_fkey"
      columns: ["tarjeta_id"]
isOneToOne: false
      referencedRelation: "tarjetas_credito"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "compras_tc_tarjeta_id_fkey"
      columns: ["tarjeta_id"]
isOneToOne: false
      referencedRelation: "v_estado_tarjetas"
      referencedColumns: ["id"]
    }
                  ]
                },"v_estado_deudas": {
                  Row: {
                    "acreedor": string | null,"activa": boolean | null,"aporte_mensual": number | null,"created_at": string | null,"cuenta_aportes_id": string | null,"cuenta_aportes_nombre": string | null,"cuenta_desembolso_id": string | null,"cuenta_pago_default_id": string | null,"cuenta_pago_nombre": string | null,"cuota": number | null,"cuota_total": number | null,"dia_pago": number | null,"fecha_desembolso": string | null,"fecha_saldo_inicial": string | null,"id": string | null,"intereses_anio": number | null,"monto_original": number | null,"n_pagos": number | null,"nombre": string | null,"notas": string | null,"obligacion_id": string | null,"pagado_aportes": number | null,"pagado_capital": number | null,"pagado_intereses": number | null,"pagado_seguros": number | null,"pagado_total": number | null,"plazo_meses": number | null,"saldo_capital": number | null,"saldo_inicial": number | null,"seguro_mensual": number | null,"tasa_ea": number | null,"tipo": Database["public"]['Enums']["tipo_deuda"] | null,"ultimo_pago": string | null,"user_id": string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "deudas_cuenta_aportes_id_fkey"
      columns: ["cuenta_aportes_id"]
isOneToOne: false
      referencedRelation: "cuentas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "deudas_cuenta_aportes_id_fkey"
      columns: ["cuenta_aportes_id"]
isOneToOne: false
      referencedRelation: "v_saldos_cuentas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "deudas_cuenta_desembolso_id_fkey"
      columns: ["cuenta_desembolso_id"]
isOneToOne: false
      referencedRelation: "cuentas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "deudas_cuenta_desembolso_id_fkey"
      columns: ["cuenta_desembolso_id"]
isOneToOne: false
      referencedRelation: "v_saldos_cuentas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "deudas_cuenta_pago_default_id_fkey"
      columns: ["cuenta_pago_default_id"]
isOneToOne: false
      referencedRelation: "cuentas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "deudas_cuenta_pago_default_id_fkey"
      columns: ["cuenta_pago_default_id"]
isOneToOne: false
      referencedRelation: "v_saldos_cuentas"
      referencedColumns: ["id"]
    }
                  ]
                },"v_estado_tarjetas": {
                  Row: {
                    "activa": boolean | null,"capital": number | null,"costo_financiero_anio": number | null,"costo_financiero_total": number | null,"cuenta_id": string | null,"cuenta_pago_default_id": string | null,"cuota_manejo_ref": number | null,"cupo": number | null,"deuda_total": number | null,"dia_corte": number | null,"dia_limite_pago": number | null,"entidad": string | null,"franquicia": string | null,"id": string | null,"n_compras": number | null,"nombre": string | null,"otros_pendientes": number | null,"pagado_anio": number | null,"primera_actividad": string | null,"tasa_ea_ref": number | null,"ultima_alerta": string | null,"ultima_fecha_limite": string | null,"ultimo_corte": string | null,"ultimo_estado": Database["public"]['Enums']["estado_extracto"] | null,"ultimo_extracto_id": string | null,"ultimo_pagado": number | null,"ultimo_pago_minimo": number | null,"ultimo_pago_total": number | null,"ultimos4": string | null,"user_id": string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "tarjetas_credito_cuenta_id_fkey"
      columns: ["cuenta_id"]
isOneToOne: true
      referencedRelation: "cuentas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tarjetas_credito_cuenta_id_fkey"
      columns: ["cuenta_id"]
isOneToOne: true
      referencedRelation: "v_saldos_cuentas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tarjetas_credito_cuenta_pago_default_id_fkey"
      columns: ["cuenta_pago_default_id"]
isOneToOne: false
      referencedRelation: "cuentas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tarjetas_credito_cuenta_pago_default_id_fkey"
      columns: ["cuenta_pago_default_id"]
isOneToOne: false
      referencedRelation: "v_saldos_cuentas"
      referencedColumns: ["id"]
    }
                  ]
                },"v_gasto_categoria_mes": {
                  Row: {
                    "bolsa": Database["public"]['Enums']["bolsa_503020"] | null,"categoria_id": string | null,"categoria_nombre": string | null,"color": string | null,"es_fija": boolean | null,"grupo": string | null,"icono": string | null,"mes": string | null,"n_movimientos": number | null,"padre_id": string | null,"padre_nombre": string | null,"periodo_id": string | null,"total": number | null,"user_id": string | null
                  }
                  Relationships: [
                    
                  ]
                },"v_metas": {
                  Row: {
                    "activa": boolean | null,"actual": number | null,"aporte_mensual": number | null,"created_at": string | null,"cuenta_id": string | null,"cuenta_nombre": string | null,"deuda_id": string | null,"deuda_nombre": string | null,"deuda_saldo": number | null,"fecha_objetivo": string | null,"id": string | null,"monto_objetivo": number | null,"nombre": string | null,"notas": string | null,"tipo": Database["public"]['Enums']["tipo_meta"] | null,"user_id": string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "metas_cuenta_id_fkey"
      columns: ["cuenta_id"]
isOneToOne: false
      referencedRelation: "cuentas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "metas_cuenta_id_fkey"
      columns: ["cuenta_id"]
isOneToOne: false
      referencedRelation: "v_saldos_cuentas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "metas_deuda_id_fkey"
      columns: ["deuda_id"]
isOneToOne: false
      referencedRelation: "deudas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "metas_deuda_id_fkey"
      columns: ["deuda_id"]
isOneToOne: false
      referencedRelation: "v_estado_deudas"
      referencedColumns: ["id"]
    }
                  ]
                },"v_movimientos": {
                  Row: {
                    "adjunto_path": string | null,"categoria_color": string | null,"categoria_icono": string | null,"categoria_id": string | null,"categoria_nombre": string | null,"categoria_padre_id": string | null,"categoria_padre_nombre": string | null,"comercio": string | null,"created_at": string | null,"cuenta_destino_id": string | null,"cuenta_destino_nombre": string | null,"cuenta_id": string | null,"cuenta_nombre": string | null,"descripcion": string | null,"deuda_id": string | null,"es_recuperacion": boolean | null,"estado_periodo": Database["public"]['Enums']["estado_periodo"] | null,"etiquetas": (string)[] | null,"fecha": string | null,"id": string | null,"mes": string | null,"monto": number | null,"obligacion_nombre": string | null,"obligacion_periodo_id": string | null,"periodo_id": string | null,"prestamo_id": string | null,"prestamo_otorgado_id": string | null,"reembolsable": boolean | null,"reembolsado_por_id": string | null,"tipo": Database["public"]['Enums']["tipo_movimiento"] | null,"updated_at": string | null,"user_id": string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "categorias_padre_id_fkey"
      columns: ["categoria_padre_id"]
isOneToOne: false
      referencedRelation: "categorias"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "categorias_padre_id_fkey"
      columns: ["categoria_padre_id"]
isOneToOne: false
      referencedRelation: "v_consumo_mes"
      referencedColumns: ["categoria_id"]
    },{
      foreignKeyName: "categorias_padre_id_fkey"
      columns: ["categoria_padre_id"]
isOneToOne: false
      referencedRelation: "v_gasto_categoria_mes"
      referencedColumns: ["categoria_id"]
    },{
      foreignKeyName: "categorias_padre_id_fkey"
      columns: ["categoria_padre_id"]
isOneToOne: false
      referencedRelation: "v_gasto_categoria_mes"
      referencedColumns: ["padre_id"]
    },{
      foreignKeyName: "movimientos_categoria_id_fkey"
      columns: ["categoria_id"]
isOneToOne: false
      referencedRelation: "categorias"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "movimientos_categoria_id_fkey"
      columns: ["categoria_id"]
isOneToOne: false
      referencedRelation: "v_consumo_mes"
      referencedColumns: ["categoria_id"]
    },{
      foreignKeyName: "movimientos_categoria_id_fkey"
      columns: ["categoria_id"]
isOneToOne: false
      referencedRelation: "v_gasto_categoria_mes"
      referencedColumns: ["categoria_id"]
    },{
      foreignKeyName: "movimientos_categoria_id_fkey"
      columns: ["categoria_id"]
isOneToOne: false
      referencedRelation: "v_gasto_categoria_mes"
      referencedColumns: ["padre_id"]
    },{
      foreignKeyName: "movimientos_cuenta_destino_id_fkey"
      columns: ["cuenta_destino_id"]
isOneToOne: false
      referencedRelation: "cuentas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "movimientos_cuenta_destino_id_fkey"
      columns: ["cuenta_destino_id"]
isOneToOne: false
      referencedRelation: "v_saldos_cuentas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "movimientos_cuenta_id_fkey"
      columns: ["cuenta_id"]
isOneToOne: false
      referencedRelation: "cuentas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "movimientos_cuenta_id_fkey"
      columns: ["cuenta_id"]
isOneToOne: false
      referencedRelation: "v_saldos_cuentas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "movimientos_obligacion_periodo_id_fkey"
      columns: ["obligacion_periodo_id"]
isOneToOne: false
      referencedRelation: "obligaciones_periodo"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "movimientos_obligacion_periodo_id_fkey"
      columns: ["obligacion_periodo_id"]
isOneToOne: false
      referencedRelation: "v_obligaciones_mes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "movimientos_periodo_id_fkey"
      columns: ["periodo_id"]
isOneToOne: false
      referencedRelation: "periodos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "movimientos_periodo_id_fkey"
      columns: ["periodo_id"]
isOneToOne: false
      referencedRelation: "v_resumen_periodo"
      referencedColumns: ["periodo_id"]
    },{
      foreignKeyName: "movimientos_prestamo_otorgado_id_fkey"
      columns: ["prestamo_otorgado_id"]
isOneToOne: false
      referencedRelation: "prestamos_otorgados"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "movimientos_prestamo_otorgado_id_fkey"
      columns: ["prestamo_otorgado_id"]
isOneToOne: false
      referencedRelation: "v_prestamos_otorgados"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "movimientos_reembolsado_por_id_fkey"
      columns: ["reembolsado_por_id"]
isOneToOne: false
      referencedRelation: "movimientos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "movimientos_reembolsado_por_id_fkey"
      columns: ["reembolsado_por_id"]
isOneToOne: false
      referencedRelation: "v_movimientos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "movimientos_reembolsado_por_id_fkey"
      columns: ["reembolsado_por_id"]
isOneToOne: false
      referencedRelation: "v_reembolsos"
      referencedColumns: ["id"]
    }
                  ]
                },"v_obligaciones_mes": {
                  Row: {
                    "arrastrada_de_id": string | null,"categoria_color": string | null,"categoria_icono": string | null,"categoria_id": string | null,"categoria_nombre": string | null,"created_at": string | null,"cuenta_default_id": string | null,"cuenta_default_nombre": string | null,"deuda_id": string | null,"es_ingreso": boolean | null,"es_variable": boolean | null,"estado_periodo": Database["public"]['Enums']["estado_periodo"] | null,"extracto_id": string | null,"fecha_vencimiento": string | null,"frecuencia": Database["public"]['Enums']["frecuencia"] | null,"id": string | null,"mes": string | null,"monto_esperado": number | null,"motivo": string | null,"n_pagos": number | null,"nombre": string | null,"nota": string | null,"obligacion_id": string | null,"pagada": boolean | null,"pagado": number | null,"pago_minimo_tc": number | null,"pago_total_tc": number | null,"pendiente": number | null,"periodo_id": string | null,"referencia_pago": string | null,"resolucion": string | null,"tarjeta_id": string | null,"tipo": Database["public"]['Enums']["tipo_obligacion"] | null,"ultimo_pago": string | null,"user_id": string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "extractos_tc_tarjeta_id_fkey"
      columns: ["tarjeta_id"]
isOneToOne: false
      referencedRelation: "tarjetas_credito"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "extractos_tc_tarjeta_id_fkey"
      columns: ["tarjeta_id"]
isOneToOne: false
      referencedRelation: "v_estado_tarjetas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "obligaciones_periodo_arrastrada_de_id_fkey"
      columns: ["arrastrada_de_id"]
isOneToOne: false
      referencedRelation: "obligaciones_periodo"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "obligaciones_periodo_arrastrada_de_id_fkey"
      columns: ["arrastrada_de_id"]
isOneToOne: false
      referencedRelation: "v_obligaciones_mes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "obligaciones_periodo_categoria_id_fkey"
      columns: ["categoria_id"]
isOneToOne: false
      referencedRelation: "categorias"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "obligaciones_periodo_categoria_id_fkey"
      columns: ["categoria_id"]
isOneToOne: false
      referencedRelation: "v_consumo_mes"
      referencedColumns: ["categoria_id"]
    },{
      foreignKeyName: "obligaciones_periodo_categoria_id_fkey"
      columns: ["categoria_id"]
isOneToOne: false
      referencedRelation: "v_gasto_categoria_mes"
      referencedColumns: ["categoria_id"]
    },{
      foreignKeyName: "obligaciones_periodo_categoria_id_fkey"
      columns: ["categoria_id"]
isOneToOne: false
      referencedRelation: "v_gasto_categoria_mes"
      referencedColumns: ["padre_id"]
    },{
      foreignKeyName: "obligaciones_periodo_cuenta_default_id_fkey"
      columns: ["cuenta_default_id"]
isOneToOne: false
      referencedRelation: "cuentas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "obligaciones_periodo_cuenta_default_id_fkey"
      columns: ["cuenta_default_id"]
isOneToOne: false
      referencedRelation: "v_saldos_cuentas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "obligaciones_periodo_extracto_id_fkey"
      columns: ["extracto_id"]
isOneToOne: true
      referencedRelation: "extractos_tc"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "obligaciones_periodo_extracto_id_fkey"
      columns: ["extracto_id"]
isOneToOne: true
      referencedRelation: "v_estado_tarjetas"
      referencedColumns: ["ultimo_extracto_id"]
    },{
      foreignKeyName: "obligaciones_periodo_obligacion_id_fkey"
      columns: ["obligacion_id"]
isOneToOne: false
      referencedRelation: "obligaciones"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "obligaciones_periodo_obligacion_id_fkey"
      columns: ["obligacion_id"]
isOneToOne: false
      referencedRelation: "v_estado_deudas"
      referencedColumns: ["obligacion_id"]
    },{
      foreignKeyName: "obligaciones_periodo_periodo_id_fkey"
      columns: ["periodo_id"]
isOneToOne: false
      referencedRelation: "periodos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "obligaciones_periodo_periodo_id_fkey"
      columns: ["periodo_id"]
isOneToOne: false
      referencedRelation: "v_resumen_periodo"
      referencedColumns: ["periodo_id"]
    }
                  ]
                },"v_patrimonio": {
                  Row: {
                    "cuentas": number | null,"deuda_tarjetas": number | null,"devtopia": number | null,"patrimonio": number | null,"por_cobrar": number | null,"prestamos": number | null,"user_id": string | null
                  }
                  Relationships: [
                    
                  ]
                },"v_prestamos_otorgados": {
                  Row: {
                    "abonado": number | null,"castigado_en": string | null,"created_at": string | null,"cuenta_origen_id": string | null,"cuenta_origen_nombre": string | null,"deudor": string | null,"estado": string | null,"estado_periodo": Database["public"]['Enums']["estado_periodo"] | null,"fecha": string | null,"fecha_esperada": string | null,"id": string | null,"monto": number | null,"motivo_castigo": string | null,"movimiento_id": string | null,"n_abonos": number | null,"notas": string | null,"saldo": number | null,"ultimo_abono": string | null,"user_id": string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "prestamos_otorgados_cuenta_origen_id_fkey"
      columns: ["cuenta_origen_id"]
isOneToOne: false
      referencedRelation: "cuentas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "prestamos_otorgados_cuenta_origen_id_fkey"
      columns: ["cuenta_origen_id"]
isOneToOne: false
      referencedRelation: "v_saldos_cuentas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "prestamos_otorgados_movimiento_id_fkey"
      columns: ["movimiento_id"]
isOneToOne: true
      referencedRelation: "movimientos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "prestamos_otorgados_movimiento_id_fkey"
      columns: ["movimiento_id"]
isOneToOne: true
      referencedRelation: "v_movimientos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "prestamos_otorgados_movimiento_id_fkey"
      columns: ["movimiento_id"]
isOneToOne: true
      referencedRelation: "v_reembolsos"
      referencedColumns: ["id"]
    }
                  ]
                },"v_reembolsos": {
                  Row: {
                    "created_at": string | null,"cuenta_id": string | null,"cuenta_nombre": string | null,"descripcion": string | null,"estado_periodo": Database["public"]['Enums']["estado_periodo"] | null,"fecha": string | null,"id": string | null,"monto": number | null,"n_items": number | null,"total_items": number | null,"user_id": string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "movimientos_cuenta_id_fkey"
      columns: ["cuenta_id"]
isOneToOne: false
      referencedRelation: "cuentas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "movimientos_cuenta_id_fkey"
      columns: ["cuenta_id"]
isOneToOne: false
      referencedRelation: "v_saldos_cuentas"
      referencedColumns: ["id"]
    }
                  ]
                },"v_reembolsos_pendientes": {
                  Row: {
                    "categoria_nombre": string | null,"created_at": string | null,"descripcion": string | null,"estado_periodo": Database["public"]['Enums']["estado_periodo"] | null,"fecha": string | null,"id": string | null,"medio": string | null,"monto": number | null,"origen": string | null,"user_id": string | null
                  }
                  Relationships: [
                    
                  ]
                },"v_resumen_periodo": {
                  Row: {
                    "abonos_capital_deudas": number | null,"aportes": number | null,"cerrado_en": string | null,"costos_financieros_deudas": number | null,"costos_financieros_tc": number | null,"desembolsos": number | null,"estado": Database["public"]['Enums']["estado_periodo"] | null,"gastos": number | null,"gastos_cuentas": number | null,"gastos_reembolsables": number | null,"gastos_tc": number | null,"ingresos": number | null,"ingresos_esperados": number | null,"ingresos_esperados_pendientes": number | null,"ingresos_esperados_recibidos": number | null,"mes": string | null,"monto_obligaciones": number | null,"monto_pagado_obligaciones": number | null,"monto_pendiente_obligaciones": number | null,"n_movimientos": number | null,"obligaciones_arrastradas": number | null,"obligaciones_omitidas": number | null,"obligaciones_pagadas": number | null,"obligaciones_pendientes": number | null,"obligaciones_total": number | null,"pagos_deuda": number | null,"pagos_tc": number | null,"periodo_id": string | null,"prestamos_otorgados": number | null,"recuperaciones": number | null,"reembolsos": number | null,"salidas_caja": number | null,"user_id": string | null
                  }
                  Relationships: [
                    
                  ]
                },"v_saldos_cuentas": {
                  Row: {
                    "activa": boolean | null,"color": string | null,"entidad": string | null,"fecha_saldo_inicial": string | null,"id": string | null,"n_movimientos": number | null,"nombre": string | null,"orden": number | null,"saldo": number | null,"saldo_inicial": number | null,"tipo": Database["public"]['Enums']["tipo_cuenta"] | null,"user_id": string | null
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Functions: {
            "_columnas_diferidas":
{ Args: Record<PropertyKey, never>; Returns: {
              "columna": string,"tabla": string
            }[]
                           },
"_respaldo_de":
{ Args: { "p_user": string }; Returns: Json
                           },
"_tablas_respaldo":
{ Args: Record<PropertyKey, never>; Returns: (string)[]
                           },
"cerrar_periodo":
{ Args: { "p_decisiones"?: Json,"p_periodo": string }; Returns: Json
                           },
"corte_de_compra":
{ Args: { "p_dia_corte": number,"p_fecha": string }; Returns: string
                           },
"crear_tarjeta":
{ Args: { "p_cuenta_pago_default_id"?: string,"p_cuota_manejo_ref"?: number,"p_cupo": number,"p_dia_corte": number,"p_dia_limite_pago": number,"p_entidad"?: string,"p_franquicia": string,"p_nombre": string,"p_tasa_ea_ref"?: number,"p_ultimos4": string }; Returns: string
                           },
"cuotas_de_compra":
{ Args: { "p_dia_corte": number,"p_fecha": string,"p_monto": number,"p_num_cuotas": number,"p_tipo": Database["public"]['Enums']["tipo_compra_tc"] }; Returns: {
              "corte": string,"numero": number,"valor": number
            }[]
                           },
"exigir_periodo_abierto":
{ Args: { "p_periodo": string }; Returns: undefined
                           },
"exigir_propietario":
{ Args: { "p_etiqueta": string,"p_id": string,"p_tabla": unknown,"p_user": string }; Returns: undefined
                           },
"exigir_reembolso":
{ Args: { "p_mov": string,"p_user": string }; Returns: undefined
                           },
"exportar_respaldo":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"exportar_respaldo_usuario":
{ Args: { "p_user": string }; Returns: Json
                           },
"fecha_en_mes":
{ Args: { "p_dia": number,"p_mes": string }; Returns: string
                           },
"generar_periodo":
{ Args: { "p_mes": string }; Returns: string
                           },
"generar_periodo_de_usuario":
{ Args: { "p_mes": string,"p_user": string }; Returns: string
                           },
"generar_periodo_todos":
{ Args: { "p_mes": string }; Returns: number
                           },
"guardar_presupuesto":
{ Args: { "p_items": Json,"p_periodo": string }; Returns: number
                           },
"inicializar_usuario":
{ Args: { "p_user": string }; Returns: undefined
                           },
"insumos_salud":
{ Args: { "p_periodo": string }; Returns: Json
                           },
"obligacion_aplica":
{ Args: { "p_fin": string,"p_frecuencia": Database["public"]['Enums']["frecuencia"],"p_inicio": string,"p_mes": string,"p_mes_ancla": string }; Returns: boolean
                           },
"periodo_de":
{ Args: { "p_fecha": string,"p_user": string }; Returns: string
                           },
"promedio_pagado":
{ Args: { "p_antes_de": string,"p_obligacion": string }; Returns: number
                           },
"reabrir_periodo":
{ Args: { "p_motivo": string,"p_periodo": string }; Returns: undefined
                           },
"recalcular_tarjeta":
{ Args: { "p_tarjeta": string }; Returns: undefined
                           },
"recordatorios_hoy":
{ Args: { "p_hoy": string }; Returns: {
              "email": string,"obligaciones": Json,"user_id": string
            }[]
                           },
"registrar_reembolso":
{ Args: { "p_compras"?: (string)[],"p_cuenta": string,"p_descripcion"?: string,"p_fecha": string,"p_monto": number,"p_movimientos"?: (string)[] }; Returns: string
                           },
"restaurar_respaldo":
{ Args: { "p_datos": Json }; Returns: Json
                           },
"solo_cambia_reembolso":
{ Args: { "p_new": Json,"p_old": Json }; Returns: boolean
                           }
          }
          Enums: {
            "bolsa_503020": "necesidad"|"deseo"|"ahorro_deuda"|"no_aplica","estado_extracto": "pendiente"|"parcial"|"minimo_cubierto"|"pagado_total","estado_periodo": "abierto"|"cerrado","frecuencia": "mensual"|"bimestral"|"trimestral"|"semestral"|"anual","tipo_categoria": "ingreso"|"gasto","tipo_compra_tc": "compra"|"avance"|"devolucion"|"ajuste","tipo_cuenta": "ahorros"|"corriente"|"efectivo"|"billetera"|"tarjeta_credito"|"cooperativa"|"inversion","tipo_deuda": "banco"|"libranza"|"cooperativa"|"persona"|"otro","tipo_meta": "ahorro"|"fondo_emergencia"|"pagar_deuda"|"compra","tipo_movimiento": "ingreso"|"gasto"|"transferencia"|"pago_tc"|"pago_deuda"|"aporte"|"prestamo_otorgado"|"recuperacion_prestamo"|"desembolso_deuda"|"reembolso_devtopia","tipo_obligacion": "servicio"|"arriendo"|"telecom"|"tarjeta"|"deuda"|"cooperativa"|"seguridad_social"|"ingreso_esperado"|"ahorro"|"otro","tipo_pago_tc": "total"|"minimo"|"otro"|"inferior_minimo"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "bolsa_503020": ["necesidad", "deseo", "ahorro_deuda", "no_aplica"],"estado_extracto": ["pendiente", "parcial", "minimo_cubierto", "pagado_total"],"estado_periodo": ["abierto", "cerrado"],"frecuencia": ["mensual", "bimestral", "trimestral", "semestral", "anual"],"tipo_categoria": ["ingreso", "gasto"],"tipo_compra_tc": ["compra", "avance", "devolucion", "ajuste"],"tipo_cuenta": ["ahorros", "corriente", "efectivo", "billetera", "tarjeta_credito", "cooperativa", "inversion"],"tipo_deuda": ["banco", "libranza", "cooperativa", "persona", "otro"],"tipo_meta": ["ahorro", "fondo_emergencia", "pagar_deuda", "compra"],"tipo_movimiento": ["ingreso", "gasto", "transferencia", "pago_tc", "pago_deuda", "aporte", "prestamo_otorgado", "recuperacion_prestamo", "desembolso_deuda", "reembolso_devtopia"],"tipo_obligacion": ["servicio", "arriendo", "telecom", "tarjeta", "deuda", "cooperativa", "seguridad_social", "ingreso_esperado", "ahorro", "otro"],"tipo_pago_tc": ["total", "minimo", "otro", "inferior_minimo"]
          }
        }
} as const

