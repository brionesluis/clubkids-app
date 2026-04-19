import { Dispatch, SetStateAction, useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from './supabaseClient';

type Rol = 'Administrador principal' | 'Coordinadora' | 'Monitora';
type TabId = 'inicio' | 'agenda' | 'eventos' | 'reportes' | 'usuarios' | 'valores';
type MenuKey = 'MenuKids 1' | 'MenuKids 2' | 'MenuKids 3';
type PaymentMethod = 'Efectivo' | 'Tarjeta' | 'Transferencia';
type EventStatus = 'Pendiente' | 'Confirmado' | 'Realizado' | 'Cancelado';
type DiscountType = 'none' | 'funcionario' | 'especial';

type User = {
  id: string;
  nombre: string;
  usuario: string;
  clave: string;
  rol: Rol;
  activo: boolean;
};

type MenuPriceVersion = {
  effectiveAt: string;
  prices: Record<MenuKey, number>;
  staffDiscountPct: number;
};

type Checklist = {
  invitacionEnviada: boolean;
  pendonListo: boolean;
  baseParaPadres: boolean;
  pintacarita: boolean;
  tarjetasArcadeEntregar: boolean;
  cantidadTarjetasArcade: number;
};

type EventItem = {
  id: string;
  nombreEvento: string;
  nombreCliente: string;
  telefono: string;
  fecha: string;
  horario: string;
  menu: MenuKey;
  valorPorInvitado: number;
  tematica: string;
  sala: string;
  edadCumple: number;
  invitados: number;
  subtotal: number;
  discountType: DiscountType;
  discountPct: number;
  totalFinal: number;
  abono: number;
  medioPagoAbono: PaymentMethod;
  observaciones: string;
  estado: EventStatus;
  creadoPor: string;
  createdAt: string;
  updatedAt: string;
  checklist: Checklist;
};

type Filters = {
  month: string;
  menu: string;
  status: string;
  sala: string;
  search: string;
};

type FormState = {
  nombreEvento: string;
  nombreCliente: string;
  telefono: string;
  fecha: string;
  horario: string;
  menu: MenuKey;
  tematica: string;
  sala: string;
  edadCumple: number;
  invitados: number;
  abono: number;
  medioPagoAbono: PaymentMethod;
  observaciones: string;
  discountType: DiscountType;
  specialDiscountPct: number;
};

const STORAGE_KEYS = {
  users: 'clubkids_v3_users',
  events: 'clubkids_v3_events',
  values: 'clubkids_v3_values',
} as const;

const COLORS = {
  turquoise: '#1FA5B5',
  fuchsia: '#E81E3C',
  purple: '#9B5C8F',
  orange: '#F59E0B',
  white: '#FFFFFF',
  ink: '#173042',
  soft: '#F6FAFC',
};

const salas = ['Sala 1', 'Sala 2', 'Sala 3', 'Sala 4'];
const horarios = ['12:00 - 14:00', '15:00 - 17:00', '18:00 - 20:00'];
const menuKeys: MenuKey[] = ['MenuKids 1', 'MenuKids 2', 'MenuKids 3'];
const weekdays = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const tabOrder: TabId[] = ['inicio', 'agenda', 'eventos', 'reportes', 'usuarios', 'valores'];

const defaultUsers: User[] = [
  { id: uid(), nombre: 'Administrador Principal', usuario: 'admin', clave: '1234', rol: 'Administrador principal', activo: true },
  { id: uid(), nombre: 'Coordinadora 1', usuario: 'coordinadora1', clave: '1234', rol: 'Coordinadora', activo: true },
  { id: uid(), nombre: 'Coordinadora 2', usuario: 'coordinadora2', clave: '1234', rol: 'Coordinadora', activo: true },
  { id: uid(), nombre: 'Monitora 1', usuario: 'monitora1', clave: '1234', rol: 'Monitora', activo: true },
  { id: uid(), nombre: 'Monitora 2', usuario: 'monitora2', clave: '1234', rol: 'Monitora', activo: true },
  { id: uid(), nombre: 'Monitora 3', usuario: 'monitora3', clave: '1234', rol: 'Monitora', activo: true },
  { id: uid(), nombre: 'Monitora 4', usuario: 'monitora4', clave: '1234', rol: 'Monitora', activo: true },
];

const defaultValueHistory: MenuPriceVersion[] = [
  {
    effectiveAt: '2026-01-01T00:00:00.000Z',
    prices: {
      'MenuKids 1': 12900,
      'MenuKids 2': 16900,
      'MenuKids 3': 19900,
    },
    staffDiscountPct: 25,
  },
];

const sampleEvents: EventItem[] = [
  createSeedEvent({ fecha: isoDate(offsetDate(0)), horario: '12:00 - 14:00', sala: 'Sala 1', nombreEvento: 'Cumple Emilia', nombreCliente: 'Camila Soto', menu: 'MenuKids 2', invitados: 18, edadCumple: 6, abono: 60000, estado: 'Confirmado' }),
  createSeedEvent({ fecha: isoDate(offsetDate(1)), horario: '15:00 - 17:00', sala: 'Sala 2', nombreEvento: 'Cumple Mateo', nombreCliente: 'Felipe Rojas', menu: 'MenuKids 1', invitados: 14, edadCumple: 5, abono: 45000, estado: 'Pendiente' }),
  createSeedEvent({ fecha: isoDate(offsetDate(3)), horario: '18:00 - 20:00', sala: 'Sala 3', nombreEvento: 'Cumple Sofía', nombreCliente: 'Valentina Díaz', menu: 'MenuKids 3', invitados: 22, edadCumple: 7, abono: 80000, estado: 'Confirmado' }),
  createSeedEvent({ fecha: isoDate(offsetDate(5)), horario: '12:00 - 14:00', sala: 'Sala 4', nombreEvento: 'Cumple Benja', nombreCliente: 'Patricia Mora', menu: 'MenuKids 1', invitados: 16, edadCumple: 4, abono: 30000, estado: 'Pendiente' }),
];

function App() {
  const [saveMessage, setSaveMessage] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [valueHistory, setValueHistory] = useLocalStorage<MenuPriceVersion[]>(STORAGE_KEYS.values, defaultValueHistory);
  const [activeUser, setActiveUser] = useState<User | null>(null);
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const inputUserRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
  inputUserRef.current?.focus();
}, []);
  const [loginError, setLoginError] = useState('');
  const [activeTab, setActiveTab] = useState<TabId>('inicio');
  const [currentMonth, setCurrentMonth] = useState(startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState<string>(isoDate(new Date()));
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [globalSearch, setGlobalSearch] = useState('');
  const [filters, setFilters] = useState<Filters>({ month: '', menu: '', status: '', sala: '', search: '' });
  const [formState, setFormState] = useState<FormState>(buildInitialForm(isoDate(new Date()), '12:00 - 14:00'));
  const [userForm, setUserForm] = useState({ nombre: '', usuario: '', clave: '', rol: 'Monitora' as Rol });
  const [editingUserId, setEditingUserId] = useState<string | null>(null);

useEffect(() => {
  async function cargarEventosDesdeSupabase() {
    const { data, error } = await supabase
      .from('eventos')
      .select('*')
      .order('fecha', { ascending: true });

    if (error) {
      console.error('ERROR CARGANDO EVENTOS:', error);
      return;
    }

    const eventosMapeados: EventItem[] = (data || []).map((item) => ({
      id: item.id,
      nombreEvento: item.nombre_evento,
      nombreCliente: item.nombre_cliente,
      telefono: item.telefono,
      fecha: item.fecha,
      horario: item.horario,
      menu: item.menu,
      valorPorInvitado: Number(item.valor_por_invitado ?? 0),
      tematica: item.tematica ?? '',
      sala: item.sala,
      edadCumple: Number(item.edad_cumple ?? 0),
      invitados: Number(item.invitados ?? 0),
      subtotal: Number(item.subtotal ?? 0),
      discountType: (item.discount_type ?? 'none') as DiscountType,
      discountPct: Number(item.discount_pct ?? 0),
      totalFinal: Number(item.total_final ?? 0),
      abono: Number(item.abono ?? 0),
      medioPagoAbono: (item.medio_pago_abono ?? 'Transferencia') as PaymentMethod,
      observaciones: item.observaciones ?? '',
      estado: (item.estado ?? 'Pendiente') as EventStatus,
      creadoPor: item.creado_por ?? '',
      createdAt: item.created_at ?? new Date().toISOString(),
      updatedAt: item.updated_at ?? new Date().toISOString(),
      checklist: {
  invitacionEnviada: item.invitacion_enviada ?? false,
  pendonListo: item.pendon_listo ?? false,
  baseParaPadres: item.base_para_padres ?? false,
  pintacarita: item.pintacarita ?? false,
  tarjetasArcadeEntregar: item.tarjetas_arcade ?? false,
  cantidadTarjetasArcade: 0,
},
    }));

    setEvents(eventosMapeados);
  }

  cargarEventosDesdeSupabase();
}, []);

useEffect(() => {
  async function cargarUsuariosDesdeSupabase() {
    const { data, error } = await supabase
      .from('usuarios')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('ERROR CARGANDO USUARIOS:', error);
      return;
    }

    const usuariosMapeados: User[] = (data || []).map((item) => ({
      id: item.id,
      nombre: item.nombre,
      usuario: item.usuario,
      clave: item.clave,
      rol: item.rol,
      activo: item.activo ?? true,
    }));

    setUsers(usuariosMapeados);
  }

  cargarUsuariosDesdeSupabase();
}, []);

useEffect(() => {
  async function cargarValoresDesdeSupabase() {
    const { data, error } = await supabase
      .from('valores_menu')
      .select('*');

    if (error) {
      console.error('ERROR CARGANDO VALORES:', error);
      return;
    }

    const nuevosValores = {
      menu1: 12900,
  menu2: 16900,
  menu3: 19900,
  staffDiscountPct: 0,
    };

    (data || []).forEach((item) => {
      if (item.menu === 'MenuKids 1') nuevosValores.menu1 = Number(item.precio);
      if (item.menu === 'MenuKids 2') nuevosValores.menu2 = Number(item.precio);
      if (item.menu === 'MenuKids 3') nuevosValores.menu3 = Number(item.precio);
    });

    setValueEditor(nuevosValores);
  }

  cargarValoresDesdeSupabase();
}, []);

  const [valueEditor, setValueEditor] = useState({ menu1: 12900, menu2: 16900, menu3: 19900, staffDiscountPct: 25 });
  const formRef = useRef<HTMLDivElement | null>(null);
  const dailyAlertsRef = useRef<HTMLDivElement | null>(null);
  
 
const isAdmin = activeUser?.rol === 'Administrador principal';

const canEditEvents =
  activeUser?.rol === 'Administrador principal' ||
  activeUser?.rol === 'Coordinadora';

const today = isoDate(new Date());
const tomorrow = isoDate(offsetDate(1));

const eventsSorted = useMemo(() => {
  return [...events].sort((a, b) => {
    const fechaA = `${a.fecha} ${a.horario}`;
    const fechaB = `${b.fecha} ${b.horario}`;
    return fechaA.localeCompare(fechaB);
  });
}, [events]);

  const todaysEvents = eventsSorted.filter((event) => event.fecha === today);
  const tomorrowsEvents = eventsSorted.filter((event) => event.fecha === tomorrow);
  const upcomingEvents = eventsSorted.filter((event) => event.fecha >= today).slice(0, 4);

  const selectedDateEvents = useMemo(
    () => eventsSorted.filter((event) => event.fecha === selectedDate),
    [eventsSorted, selectedDate],
  );

  const selectedEvent = useMemo(
    () => events.find((event) => event.id === selectedEventId) ?? null,
    [events, selectedEventId],
  );

  const searchedEvents = useMemo(() => {
    const term = globalSearch.trim().toLowerCase();
    if (!term) return [];
    return eventsSorted.filter((event) => [
      event.nombreEvento,
      event.nombreCliente,
      event.telefono,
      event.tematica,
      event.sala,
      event.menu,
      event.fecha,
    ].some((field) => field.toLowerCase().includes(term)));
  }, [eventsSorted, globalSearch]);

  const filteredEventList = useMemo(() => {
    return eventsSorted.filter((event) => {
      const monthOk = !filters.month || event.fecha.startsWith(filters.month);
      const menuOk = !filters.menu || event.menu === filters.menu;
      const statusOk = !filters.status || event.estado === filters.status;
      const salaOk = !filters.sala || event.sala === filters.sala;
      const search = filters.search.trim().toLowerCase();
      const searchOk = !search || [event.nombreEvento, event.nombreCliente, event.tematica, event.telefono].some((value) => value.toLowerCase().includes(search));
      return monthOk && menuOk && statusOk && salaOk && searchOk;
    });
  }, [eventsSorted, filters]);

  const monthlyMetrics = useMemo(() => buildMetrics(eventsSorted), [eventsSorted]);

  const calendarCells = useMemo(() => buildCalendar(currentMonth, eventsSorted), [currentMonth, eventsSorted]);

const handleLogin = async () => {
  const usuarioIngresado = loginUser.trim().toLowerCase();
  const claveIngresada = loginPass.trim();

  const { data, error } = await supabase
    .from('usuarios')
    .select('*')
    .eq('usuario', usuarioIngresado)
    .eq('clave', claveIngresada)
    .single();

  if (error || !data) {
  setLoginError(`Usuario o contraseña incorrectos`);
  console.error('ERROR LOGIN:', error);
  alert(`Login falló: ${error?.message ?? 'sin coincidencia en Supabase'}`);
  return;
}

  setActiveUser(data);
  setLoginError('');
};

  const handleLogout = () => {
    setActiveUser(null);
    setSelectedEventId(null);
    setIsFormOpen(false);
    setEditingEventId(null);
  };

  const openDayAlert = (date: string) => {
    setActiveTab('inicio');
    setSelectedDate(date);
    if (dailyAlertsRef.current) {
      dailyAlertsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const openNewForm = (date: string, horario: string) => {
    setSelectedDate(date);
    setSelectedSlot(horario);
    setEditingEventId(null);
    setFormState(buildInitialForm(date, horario));
    setIsFormOpen(true);
  };

  const openEditForm = (event: EventItem) => {
    setActiveTab('agenda');
    setSelectedDate(event.fecha);
    setSelectedSlot(event.horario);
    setEditingEventId(event.id);
    setFormState({
      nombreEvento: event.nombreEvento,
      nombreCliente: event.nombreCliente,
      telefono: event.telefono,
      fecha: event.fecha,
      horario: event.horario,
      menu: event.menu,
      tematica: event.tematica,
      sala: event.sala,
      edadCumple: event.edadCumple,
      invitados: event.invitados,
      abono: event.abono,
      medioPagoAbono: event.medioPagoAbono,
      observaciones: event.observaciones,
      discountType: event.discountType,
      specialDiscountPct: event.discountType === 'especial' ? event.discountPct : 0,
    });
    setIsFormOpen(true);
  };

const saveEvent = async () => {
  if (!activeUser) return;
  const validation = validateForm(formState, events, editingEventId, valueHistory, activeUser);
  if (validation) {
    alert(validation);
    return;
  }

  const calculated = calculateEventTotals(
    formState,
    valueHistory,
    editingEventId ? events.find((event) => event.id === editingEventId)?.createdAt : undefined
  );

  const baseChecklist: Checklist = editingEventId
    ? events.find((event) => event.id === editingEventId)?.checklist ?? emptyChecklist()
    : emptyChecklist();

  const payload: EventItem = {
    id: editingEventId ?? uid(),
    nombreEvento: formState.nombreEvento.trim(),
    nombreCliente: formState.nombreCliente.trim(),
    telefono: normalizePhone(formState.telefono),
    fecha: formState.fecha,
    horario: formState.horario,
    menu: formState.menu,
    valorPorInvitado: calculated.valorPorInvitado,
    tematica: formState.tematica.trim(),
    sala: formState.sala,
    edadCumple: formState.edadCumple,
    invitados: formState.invitados,
    subtotal: calculated.subtotal,
    discountType: calculated.discountType,
    discountPct: calculated.discountPct,
    totalFinal: calculated.total,
    abono: formState.abono,
    medioPagoAbono: formState.medioPagoAbono,
    observaciones: formState.observaciones.trim(),
    estado: editingEventId
      ? events.find((event) => event.id === editingEventId)?.estado ?? 'Pendiente'
      : 'Pendiente',
    creadoPor: editingEventId
      ? events.find((event) => event.id === editingEventId)?.creadoPor ?? activeUser.nombre
      : activeUser.nombre,
    createdAt: editingEventId
      ? events.find((event) => event.id === editingEventId)?.createdAt ?? new Date().toISOString()
      : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    checklist: baseChecklist,
  };
  const eventoSupabase = {
  nombre_evento: payload.nombreEvento,
  nombre_cliente: payload.nombreCliente,
  telefono: payload.telefono,
  fecha: payload.fecha,
  horario: payload.horario,
  menu: payload.menu,
  valor_por_invitado: payload.valorPorInvitado,
  tematica: payload.tematica,
  sala: payload.sala,
  edad_cumple: payload.edadCumple,
  invitados: payload.invitados,
  subtotal: payload.subtotal,
  discount_type: payload.discountType,
  discount_pct: payload.discountPct,
  total_final: payload.totalFinal,
  abono: payload.abono,
  medio_pago_abono: payload.medioPagoAbono,
  observaciones: payload.observaciones,
  estado: payload.estado,
  creado_por: payload.creadoPor,
  created_at: payload.createdAt,
  updated_at: payload.updatedAt,
};

if (editingEventId) {
  const { error } = await supabase
    .from('eventos')
    .update(eventoSupabase)
    .eq('id', editingEventId);

  if (error) {
    alert('Error al actualizar en Supabase');
    console.error(error);
    return;
  }
} else {
  const { data, error } = await supabase
    .from('eventos')
    .insert([eventoSupabase])
    .select()
    .single();

  if (error) {
    alert('Error al guardar en Supabase');
    console.error(error);
    return;
  }

  if (data) {
    const nuevoEvento: EventItem = {
      id: data.id,
      nombreEvento: data.nombre_evento,
      nombreCliente: data.nombre_cliente,
      telefono: data.telefono,
      fecha: data.fecha,
      horario: data.horario,
      menu: data.menu,
      valorPorInvitado: Number(data.valor_por_invitado ?? 0),
      tematica: data.tematica ?? '',
      sala: data.sala,
      edadCumple: Number(data.edad_cumple ?? 0),
      invitados: Number(data.invitados ?? 0),
      subtotal: Number(data.subtotal ?? 0),
      discountType: data.discount_type ?? 'none',
      discountPct: Number(data.discount_pct ?? 0),
      totalFinal: Number(data.total_final ?? 0),
      abono: Number(data.abono ?? 0),
      medioPagoAbono: data.medio_pago_abono ?? 'Transferencia',
      observaciones: data.observaciones ?? '',
      estado: data.estado ?? 'Pendiente',
      creadoPor: data.creado_por ?? '',
      createdAt: data.created_at ?? new Date().toISOString(),
      updatedAt: data.updated_at ?? new Date().toISOString(),
      checklist: emptyChecklist(),
    };

    setEvents((prev) => [...prev, nuevoEvento]);
    setSelectedEventId(nuevoEvento.id);
  }
}

  if (editingEventId) {
  setEvents((prev) =>
    prev.map((event) => (event.id === editingEventId ? payload : event))
  );
}

  setSaveMessage('Evento guardado con éxito');
setTimeout(() => setSaveMessage(''), 2500);

setIsFormOpen(false);
setEditingEventId(null);
setFormState(buildInitialForm(formState.fecha, formState.horario));
};

  const deleteEvent = async (eventId: string) => {
  const evento = events.find((item) => item.id === eventId);

  const confirmar = window.confirm(
    `¿Seguro que quieres borrar${evento ? ` el evento "${evento.nombreEvento}"` : ' este evento'}?`
  );

  if (!confirmar) return;

  const { error } = await supabase
    .from('eventos')
    .delete()
    .eq('id', eventId);

  if (error) {
    alert('Error al borrar en Supabase');
    console.error(error);
    return;
  }

  setEvents((prev) => prev.filter((event) => event.id !== eventId));

  if (selectedEventId === eventId) {
    setSelectedEventId(null);
  }

  if (editingEventId === eventId) {
    setEditingEventId(null);
    setIsFormOpen(false);
  }
};

  const updateChecklist = async (
  eventId: string,
  updater: (checklist: Checklist) => Checklist
) => {
  console.log('UPDATE CHECKLIST INICIÓ', eventId);

  const eventoActual = events.find((event) => event.id === eventId);
  console.log('EVENTO ENCONTRADO:', eventoActual);

  if (!eventoActual) return;

  const nuevoChecklist = updater(eventoActual.checklist);
  console.log('NUEVO CHECKLIST:', nuevoChecklist);

  const { error } = await supabase
    .from('eventos')
    .update({
      invitacion_enviada: nuevoChecklist.invitacionEnviada,
      pendon_listo: nuevoChecklist.pendonListo,
      base_para_padres: nuevoChecklist.baseParaPadres,
      pintacarita: nuevoChecklist.pintacarita,
      tarjetas_arcade: nuevoChecklist.tarjetasArcadeEntregar,
      updated_at: new Date().toISOString(),
    })
    .eq('id', eventId);

  console.log('ERROR SUPABASE CHECKLIST:', error);

  if (error) {
    alert('Error al guardar checklist en Supabase');
    console.error(error);
    return;
  }

  setEvents((prev) =>
    prev.map((event) =>
      event.id === eventId
        ? {
            ...event,
            checklist: nuevoChecklist,
            updatedAt: new Date().toISOString(),
          }
        : event
    )
  );
};

  const saveUser = async () => {
    if (!isAdmin) return;
    if (!userForm.nombre.trim() || !userForm.usuario.trim() || !userForm.clave.trim()) {
      alert('Completa nombre, usuario y clave.');
      return;
    }
    const usernameTaken = users.some((user) => user.usuario === userForm.usuario.trim() && user.id !== editingUserId);
    if (usernameTaken) {
      alert('Ese nombre de usuario ya existe.');
      return;
    }

    const payload: User = {
      id: editingUserId ?? uid(),
      nombre: userForm.nombre.trim(),
      usuario: userForm.usuario.trim(),
      clave: userForm.clave.trim(),
      rol: userForm.rol,
      activo: true,
    };

    const usuarioSupabase = {
  nombre: userForm.nombre.trim(),
  usuario: userForm.usuario.trim().toLowerCase(),
  clave: userForm.clave.trim(),
  rol: userForm.rol,
  activo: true,
};

let data = null;
let error = null;

if (editingUserId) {
  const response = await supabase
    .from('usuarios')
    .update(usuarioSupabase)
    .eq('id', editingUserId)
    .select()
    .single();

  data = response.data;
  error = response.error;
} else {
  const response = await supabase
    .from('usuarios')
    .insert([usuarioSupabase])
    .select()
    .single();

  data = response.data;
  error = response.error;
}
if (error) {
  alert(`Error al guardar usuario en Supabase: ${error.message}`);
  console.error(error);
  return;
}

if (error) {
  alert('Error al guardar usuario en Supabase');
  console.error(error);
  return;
}

    if (data) {
  const nuevoUsuario: User = {
    id: data.id,
    nombre: data.nombre,
    usuario: data.usuario,
    clave: data.clave,
    rol: data.rol,
    activo: data.activo ?? true,
  };

  setUsers((prev) =>
    editingUserId
      ? prev.map((user) =>
          user.id === editingUserId ? nuevoUsuario : user
        )
      : [...prev, nuevoUsuario]
  );
}
    setEditingUserId(null);
    setUserForm({ nombre: '', usuario: '', clave: '', rol: 'Monitora' });
  };

  const startUserEdit = (user: User) => {
    setEditingUserId(user.id);
    setUserForm({ nombre: user.nombre, usuario: user.usuario, clave: user.clave, rol: user.rol });
  };

  const removeUser = async (userId: string) => {
  if (!isAdmin) return;

  if (activeUser?.id === userId) {
    alert('No puedes borrar el usuario que tiene la sesión actual.');
    return;
  }

  if (!window.confirm('¿Borrar este usuario?')) return;

  const { error } = await supabase
    .from('usuarios')
    .delete()
    .eq('id', userId);

  if (error) {
    alert('Error al borrar usuario en Supabase');
    console.error(error);
    return;
  }

  setUsers((prev) => prev.filter((user) => user.id !== userId));
};

  const saveValues = async () => {
  console.log('SAVE VALUES SE EJECUTÓ', valueEditor);

  try {
    const updates = [
      { menu: 'MenuKids 1', precio: Number(valueEditor.menu1) },
      { menu: 'MenuKids 2', precio: Number(valueEditor.menu2) },
      { menu: 'MenuKids 3', precio: Number(valueEditor.menu3) },
    ];

    const { data: actuales, error: errorActuales } = await supabase
      .from('valores_menu')
      .select('*');

    if (errorActuales) {
      alert(`Error al leer valores actuales: ${errorActuales.message}`);
      console.error(errorActuales);
      return;
    }

    const valoresActuales = actuales || [];

    const cambiosParaHistorial = updates.filter((item) => {
      const actual = valoresActuales.find((v) => v.menu === item.menu);
      return !actual || Number(actual.precio) !== Number(item.precio);
    });

    const { data, error } = await supabase
      .from('valores_menu')
      .upsert(updates, { onConflict: 'menu' })
      .select();

    console.log('RESPUESTA SUPABASE VALORES:', data);
    console.log('ERROR SUPABASE VALORES:', error);

    if (error) {
      alert(`Error al guardar valores: ${error.message}`);
      return;
    }

    if (cambiosParaHistorial.length > 0) {
  const historial = cambiosParaHistorial.map((item) => ({
    menu: item.menu,
    precio: item.precio,
  }));

  const { error: errorHistorial } = await supabase
    .from('historial_valores_menu')
    .insert(historial);

  if (errorHistorial) {
    alert(`Los valores se guardaron, pero falló el historial: ${errorHistorial.message}`);
    console.error(errorHistorial);
    return;
  }
}

const nuevaVersion: MenuPriceVersion = {
  effectiveAt: new Date().toISOString(),
  prices: {
    'MenuKids 1': Number(valueEditor.menu1),
    'MenuKids 2': Number(valueEditor.menu2),
    'MenuKids 3': Number(valueEditor.menu3),
  },
  staffDiscountPct: Number(valueEditor.staffDiscountPct ?? 0),
};

setValueHistory((prev) => [nuevaVersion, ...prev]);

alert('Valores guardados en Supabase ✅');
  } catch (err) {
    console.error('ERROR INESPERADO VALORES:', err);
    alert('Error inesperado');
  }
};

  const exportExcel = (type: 'week' | 'month' | 'year' | 'all') => {
    const now = new Date();
    const data = eventsSorted.filter((event) => {
      const eventDate = new Date(`${event.fecha}T00:00:00`);
      if (type === 'week') return getWeekKey(eventDate) === getWeekKey(now);
      if (type === 'month') return event.fecha.startsWith(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
      if (type === 'year') return event.fecha.startsWith(`${now.getFullYear()}`);
      return true;
    }).map(toExportRow);

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Eventos');
    XLSX.writeFile(workbook, `clubkids_${type}_${isoDate(now)}.xlsx`);
  };

  if (!activeUser) {
    return (
      <div className="login-shell">
        <div className="login-card">
          <img
  src="/logo.png"
  alt="ClubKids"
  className="logo-animado"
/>
          <span className="eyebrow">Agenda de Cumpleaños</span>
          <h1>Ingreso de usuarios</h1>
          <p>Acceso exclusivo para administradores, coordinadoras y monitoras.</p>
          <div className="login-grid">
            <label>
              Usuario
              <input ref={inputUserRef}
  value={loginUser}
  onChange={(e) => setLoginUser(e.target.value)}
  placeholder="Usuario" />
            </label>
            <label>
              Clave
              <input type="password" value={loginPass} onChange={(e) => setLoginPass(e.target.value)} placeholder="1234" />
            </label>
          </div>
          {loginError && <div className="error-box">{loginError}</div>}
          <button className="primary-btn" onClick={handleLogin}>Entrar</button>
                  
         
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar floating-card no-print">
        <div>
          <span className="arial">Agenda de Cumpleaños</span>
          <h2>CLUBKIDS</h2>
        </div>
        <div className="topbar-user">
          <div>
            <strong>{activeUser.nombre}</strong>
            <span>{activeUser.rol}</span>
          </div>
          <button className="ghost-btn" onClick={handleLogout}>Salir</button>
        </div>
      </header>

      <nav className="tabs no-print">
        {(
  activeUser.rol === 'Administrador principal'
    ? tabOrder
    : (['inicio', 'agenda', 'eventos'] as TabId[])
).map((tab) => {
          const disabled = tab === 'valores' && !isAdmin;
          return (
            <button
              key={tab}
              className={`tab-pill ${activeTab === tab ? 'active' : ''}`}
              onClick={() => !disabled && setActiveTab(tab)}
              disabled={disabled}
            >
              <span>{tabIcon(tab)}</span> {tab.toUpperCase()}
            </button>
          );
        })}
      </nav>

      <main className="content-grid">
        {activeTab === 'inicio' && (
          <section className="page fade-in">
            <div className="dashboard-grid">
              <article className="panel floating-card">
                <div className="panel-title-row">
                  <h3>Sesión actual</h3>
                  <span className="role-chip">{activeUser.rol}</span>
                </div>
                <p><strong>Usuario:</strong> {activeUser.usuario}</p>
                <p><strong>Nombre:</strong> {activeUser.nombre}</p>
                <button className="ghost-btn" onClick={handleLogout}>Cambiar usuario</button>
              </article>

              <article className="panel floating-card">
                <h3>Buscador general</h3>
                <input
                  value={globalSearch}
                  onChange={(e) => setGlobalSearch(e.target.value)}
                  placeholder="Busca por cliente, evento, teléfono, temática o sala"
                />
                {globalSearch.trim() ? (
                  <div className="search-results">
                    {searchedEvents.length ? searchedEvents.slice(0, 8).map((event) => (
                      <button key={event.id} className="search-card" onClick={() => { setSelectedEventId(event.id); setActiveTab('agenda'); setSelectedDate(event.fecha); }}>
                        <strong>{event.nombreEvento}</strong>
                        <span>{event.fecha} · {event.horario} · {event.sala}</span>
                      </button>
                    )) : <p>No se encontraron eventos.</p>}
                  </div>
                ) : null}
              </article>
            </div>

            <div className="alerts-grid no-print">
              <button className="alert-card today" onClick={() => openDayAlert(today)}>
                <span>🎉 Cumpleaños de hoy</span>
                <strong>{todaysEvents.length}</strong>
              </button>
              <button className="alert-card tomorrow" onClick={() => openDayAlert(tomorrow)}>
                <span>✨ Cumpleaños de mañana</span>
                <strong>{tomorrowsEvents.length}</strong>
              </button>
            </div>

            <div ref={dailyAlertsRef} className="dashboard-grid">
              <article className="panel floating-card">
                <h3>Lista del día seleccionado</h3>
                <p className="muted">{prettyDate(selectedDate)}</p>
                <div className="stack-list">
                  {selectedDateEvents.length ? selectedDateEvents.map((event) => (
                    <SummaryEventCard key={event.id} event={event} onView={() => setSelectedEventId(event.id)} />
                  )) : <EmptyState text="No hay cumpleaños para este día." />}
                </div>
              </article>

              <article className="panel floating-card">
                <h3>Próximos 4 cumpleaños</h3>
                <div className="stack-list">
                  {upcomingEvents.length ? upcomingEvents.map((event) => (
                    <SummaryEventCard key={event.id} event={event} onView={() => setSelectedEventId(event.id)} />
                  )) : <EmptyState text="No hay próximos cumpleaños cargados." />}
                </div>
              </article>
            </div>

            {selectedEvent && (
              <BirthdaySheet
                event={selectedEvent}
                canEdit={canEditEvents}
                onEdit={() => openEditForm(selectedEvent)}
                onPrint={() => window.print()}
                onChecklistChange={(eventId, updater) => {
  updateChecklist(eventId, updater);
}}
              />
            )}
          </section>
        )}

        {activeTab === 'agenda' && (
          <section className="page fade-in">
            <div className="agenda-layout">
              <article className="panel floating-card">
                <div className="panel-title-row">
                  <h3>Agenda mensual</h3>
                  <div className="month-switcher">
                    <button className="ghost-btn" onClick={() => setCurrentMonth(addMonths(currentMonth, -1))}>←</button>
                    <strong>{monthLabel(currentMonth)}</strong>
                    <button className="ghost-btn" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>→</button>
                  </div>
                </div>
                <div className="calendar-grid header">
                  {weekdays.map((day, index) => (
                    <div key={day} className={`calendar-head ${index === 0 || index === 1 ? 'special-day' : ''}`}>{day}</div>
                  ))}
                </div>
                <div className="calendar-grid body">
                  {calendarCells.map((cell) => (
                    <button
                      key={cell.key}
                      className={`calendar-cell ${cell.isCurrentMonth ? '' : 'muted-day'} ${cell.isToday ? 'today-cell' : ''} ${selectedDate === cell.date ? 'selected-cell' : ''}`}
                      onClick={() => setSelectedDate(cell.date)}
                    >
                      <div className="calendar-cell-top">
                        <span>{cell.day}</span>
                        {cell.count >= 12 ? <span title="Meta completa">🏆</span> : null}
                      </div>
                      <small>{cell.count ? `${cell.count} evento${cell.count > 1 ? 's' : ''}` : 'Libre'}</small>
                    </button>
                  ))}
                </div>
              </article>

              <article className="panel floating-card">
                <div className="panel-title-row">
                  <div>
                    <h3>{prettyDate(selectedDate)}</h3>
                    <p className="muted">Eventos y horarios disponibles</p>
                  </div>
                </div>
                <div className="slot-list">
                  {horarios.map((slot) => {
                    const slotEvents = selectedDateEvents.filter((event) => event.horario === slot);
                    const remaining = 4 - slotEvents.length;
                    return (
                      <div className="slot-card" key={slot}>
                        <div className="slot-header">
                          <div>
                            <strong>{slot}</strong>
                            <span>{remaining} cupos disponibles</span>
                          </div>
                          {canEditEvents && 
  <button
    className="primary-btn small"
    onClick={() => {
      openNewForm(selectedDate, slot);
      setTimeout(() => {
        formRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      }, 120);
    }}
  >
    Agendar
  </button>
}
                        </div>
                        <div className="stack-list">
                          {slotEvents.length ? slotEvents.map((event) => (
                            <div key={event.id} className="event-mini-card">
                              <div>
                                <strong>{event.nombreEvento}</strong>
                                <span>{event.nombreCliente} · {event.sala} · {event.menu}</span>
                              </div>
                              <div className="event-mini-actions no-print">
                                <button
  className="ghost-btn small"
  onClick={() => {
    setSelectedEventId(event.id);
    setTimeout(() => {
      window.scrollBy({ top: 350, behavior: 'smooth' });
    }, 100);
  }}
>
  Ver ficha
</button>
                                {canEditEvents && <button className="ghost-btn small" onClick={() => openEditForm(event)}>Editar</button>}
                                {canEditEvents && <button className="danger-btn small" onClick={() => deleteEvent(event.id)}>Borrar</button>}
                              </div>
                            </div>
                          )) : <EmptyState text="Sin eventos en este horario." />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </article>
            </div>

            {canEditEvents && isFormOpen && (
  <article ref={formRef} className="panel floating-card no-print fade-in ...">
                <div className="panel-title-row">
                  <h3>{editingEventId ? 'Editar evento' : 'Nuevo evento'}</h3>
                  <button className="ghost-btn" onClick={() => { setIsFormOpen(false); setEditingEventId(null); }}>Cerrar</button>
                </div>
                <div className="form-grid">
                  <label>Nombre del evento<input value={formState.nombreEvento} onChange={(e) => updateForm(setFormState, 'nombreEvento', e.target.value)} /></label>
                  <label>Nombre del cliente<input value={formState.nombreCliente} onChange={(e) => updateForm(setFormState, 'nombreCliente', e.target.value)} /></label>
                  <label>
  Teléfono
  <input
    value={formState.telefono}
    onChange={(e) => updateForm(setFormState, "telefono", formatPhone(e.target.value))}
  />
</label>
                  <label>Fecha<input type="date" value={formState.fecha} onChange={(e) => updateForm(setFormState, 'fecha', e.target.value)} /></label>
                  <label>Horario<select value={formState.horario} onChange={(e) => updateForm(setFormState, 'horario', e.target.value)}>{horarios.map((slot) => <option key={slot}>{slot}</option>)}</select></label>
                  <label>Selección de menú<select value={formState.menu} onChange={(e) => updateForm(setFormState, 'menu', e.target.value as MenuKey)}>{menuKeys.map((menu) => <option key={menu}>{menu}</option>)}</select></label>
                  <label>Valor por invitado<input value={formatCurrency(getPriceForMenu(formState.menu, valueHistory, editingEventId ? events.find((item) => item.id === editingEventId)?.createdAt : undefined))} readOnly /></label>
                  <label>Temática<input value={formState.tematica} onChange={(e) => updateForm(setFormState, 'tematica', e.target.value)} /></label>
                  <label>Sala<select value={formState.sala} onChange={(e) => updateForm(setFormState, 'sala', e.target.value)}>{salas.map((sala) => <option key={sala}>{sala}</option>)}</select></label>
                  <label>Edad que cumple<input type="number" min={1} value={formState.edadCumple} onChange={(e) => updateForm(setFormState, 'edadCumple', Number(e.target.value))} /></label>
                  <label>N° de invitados<input type="number" min={1} value={formState.invitados} onChange={(e) => updateForm(setFormState, 'invitados', Number(e.target.value))} /></label>
                  <label>Abono<input type="number" min={0} value={formState.abono} onChange={(e) => updateForm(setFormState, 'abono', Number(e.target.value))} /></label>
                  <label>Medio de pago<select value={formState.medioPagoAbono} onChange={(e) => updateForm(setFormState, 'medioPagoAbono', e.target.value as PaymentMethod)}><option>Efectivo</option><option>Tarjeta</option><option>Transferencia</option></select></label>
                  <label>Tipo de descuento<select value={formState.discountType} onChange={(e) => updateForm(setFormState, 'discountType', e.target.value as DiscountType)}>
                    <option value="none">Sin descuento</option>
                    <option value="funcionario">Funcionario</option>
                    {isAdmin && <option value="especial">Especial</option>}
                  </select></label>
                  {formState.discountType === 'especial' && isAdmin && <label>% descuento especial<input type="number" min={0} max={100} value={formState.specialDiscountPct} onChange={(e) => updateForm(setFormState, 'specialDiscountPct', Number(e.target.value))} /></label>}
                  <label className="full">Observaciones<textarea rows={4} value={formState.observaciones} onChange={(e) => updateForm(setFormState, 'observaciones', e.target.value)} /></label>
                </div>
                <div className="totals-box">
                  {(() => {
                    const totals = calculateEventTotals(formState, valueHistory, editingEventId ? events.find((item) => item.id === editingEventId)?.createdAt : undefined);
                    return (
                      <>
                        <div><span>Subtotal</span><strong>{formatCurrency(totals.subtotal)}</strong></div>
                        <div><span>Descuento</span><strong>{totals.discountPct}%</strong></div>
                        <div><span>Total evento</span><strong>{formatCurrency(totals.total)}</strong></div>
                        <div><span>Por cobrar</span><strong>{formatCurrency(Math.max(0, totals.total - formState.abono))}</strong></div>
                      </>
                    );
                  })()}
                </div>
                <button className="primary-btn" onClick={saveEvent}>{editingEventId ? 'Guardar cambios' : 'Guardar evento'}</button>
              </article>
            )}

            {selectedEvent && (
              <BirthdaySheet
                event={selectedEvent}
                canEdit={canEditEvents}
                onEdit={() => openEditForm(selectedEvent)}
                onPrint={() => window.print()}
                onChecklistChange={updateChecklist}
              />
            )}
          </section>
        )}

        {activeTab === 'eventos' && (
          <section className="page fade-in">
            <article className="panel floating-card no-print">
              <div className="filter-grid">
                <label>Mes<input type="month" value={filters.month} onChange={(e) => setFilters((prev) => ({ ...prev, month: e.target.value }))} /></label>
                <label>Menú<select value={filters.menu} onChange={(e) => setFilters((prev) => ({ ...prev, menu: e.target.value }))}><option value="">Todos</option>{menuKeys.map((menu) => <option key={menu}>{menu}</option>)}</select></label>
                <label>Estado<select value={filters.status} onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}><option value="">Todos</option><option>Pendiente</option><option>Confirmado</option><option>Realizado</option><option>Cancelado</option></select></label>
                <label>Sala<select value={filters.sala} onChange={(e) => setFilters((prev) => ({ ...prev, sala: e.target.value }))}><option value="">Todas</option>{salas.map((sala) => <option key={sala}>{sala}</option>)}</select></label>
                <label className="full">Buscador<input value={filters.search} onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))} placeholder="Buscar por cliente, tema, teléfono..." /></label>
              </div>
            </article>

            <article className="panel floating-card">
              <div className="panel-title-row">
                <h3>Todos los cumpleaños y eventos</h3>
                <span className="metric-chip">{filteredEventList.length} registros</span>
              </div>
              <div className="event-table-wrap">
                <table className="event-table">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Horario</th>
                      <th>Evento</th>
                      <th>Responsable</th>
                      <th>Menú</th>
                      <th>Sala</th>
                      <th>Estado</th>
                      <th>Total</th>
                      <th className="no-print">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEventList.map((event) => (
                      <tr key={event.id}>
                        <td>{prettyDateShort(event.fecha)}</td>
                        <td>{event.horario}</td>
                        <td>{event.nombreEvento}</td>
                        <td>{event.nombreCliente}</td>
                        <td>{event.menu}</td>
                        <td>{event.sala}</td>
                        <td>{event.estado}</td>
                        <td>{formatCurrency(event.totalFinal)}</td>
                        <td className="no-print">
                          <div className="table-actions">
                            <button className="ghost-btn small" onClick={() => { setSelectedEventId(event.id); setActiveTab('agenda'); }}>Ver</button>
                            {canEditEvents && <button className="ghost-btn small" onClick={() => openEditForm(event)}>Editar</button>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          </section>
        )}

        {activeTab === 'reportes' && activeUser.rol === 'Administrador principal' && (
          <section className="page fade-in">
            <div className="report-grid">
              <article className="panel floating-card">
                <div className="panel-title-row"><h3>Ventas y eventos</h3></div>
                <div className="metric-grid">
                  <MetricCard title="Semana" value={`${monthlyMetrics.week.count} eventos`} sub={formatCurrency(monthlyMetrics.week.sales)} onExport={() => exportExcel('week')} />
                  <MetricCard title="Mes" value={`${monthlyMetrics.month.count} eventos`} sub={formatCurrency(monthlyMetrics.month.sales)} onExport={() => exportExcel('month')} />
                  <MetricCard title="Año" value={`${monthlyMetrics.year.count} eventos`} sub={formatCurrency(monthlyMetrics.year.sales)} onExport={() => exportExcel('year')} />
                  <MetricCard title="Total a la fecha" value={`${eventsSorted.length} eventos`} sub={formatCurrency(monthlyMetrics.all.sales)} onExport={() => exportExcel('all')} />
                </div>
              </article>

              <article className="panel floating-card">
                <h3>Indicadores</h3>
                <div className="stats-list">
                  <StatRow label="Por cobrar" value={formatCurrency(monthlyMetrics.accountsReceivable)} />
                  <StatRow label="Ocupación 12:00 - 14:00" value={`${monthlyMetrics.occupancy['12:00 - 14:00']}%`} />
                  <StatRow label="Ocupación 15:00 - 17:00" value={`${monthlyMetrics.occupancy['15:00 - 17:00']}%`} />
                  <StatRow label="Ocupación 18:00 - 20:00" value={`${monthlyMetrics.occupancy['18:00 - 20:00']}%`} />
                  <StatRow label="Menú más vendido" value={monthlyMetrics.topMenu} />
                </div>
              </article>
            </div>

            <div className="report-grid">
              <article className="panel floating-card">
                <h3>% de menús vendidos</h3>
                {menuKeys.map((menu) => <BarRow key={menu} label={menu} value={monthlyMetrics.menuPercentages[menu]} />)}
              </article>
              <article className="panel floating-card">
                <h3>% de agendamientos anual por mes</h3>
                {monthlyMetrics.yearMonthDistribution.map((item) => <BarRow key={item.label} label={item.label} value={item.value} />)}
              </article>
            </div>

            <article className="panel floating-card">
              <h3>Comparación de cumpleaños por mes y año</h3>
              <div className="event-table-wrap">
                <table className="event-table">
                  <thead>
                    <tr>
                      <th>Mes</th>
                      {monthlyMetrics.years.map((year) => <th key={year}>{year}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyMetrics.monthComparison.map((row) => (
                      <tr key={row.month}>
                        <td>{row.month}</td>
                        {monthlyMetrics.years.map((year) => <td key={year}>{row.values[year] ?? 0}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          </section>
        )}

        {activeTab === 'usuarios' && activeUser.rol === 'Administrador principal' && (
          <section className="page fade-in">
            <div className="dashboard-grid">
              <article className="panel floating-card">
                <h3>Sesión actual</h3>
                <p><strong>{activeUser.nombre}</strong></p>
                <p>{activeUser.rol}</p>
                <button className="ghost-btn" onClick={handleLogout}>Salir</button>
              </article>

              <article className="panel floating-card no-print">
                <div className="panel-title-row"><h3>{editingUserId ? 'Modificar usuario' : 'Crear usuario nuevo'}</h3></div>
                {isAdmin ? (
                  <>
                    <div className="form-grid compact">
                      <label>Nombre<input value={userForm.nombre} onChange={(e) => setUserForm((prev) => ({ ...prev, nombre: e.target.value }))} /></label>
                      <label>Usuario<input value={userForm.usuario} onChange={(e) => setUserForm((prev) => ({ ...prev, usuario: e.target.value }))} /></label>
                      <label>Clave<input value={userForm.clave} onChange={(e) => setUserForm((prev) => ({ ...prev, clave: e.target.value }))} /></label>
                      <label>Rol<select value={userForm.rol} onChange={(e) => setUserForm((prev) => ({ ...prev, rol: e.target.value as Rol }))}><option>Administrador principal</option><option>Coordinadora</option><option>Monitora</option></select></label>
                    </div>
                    <button className="primary-btn" onClick={saveUser}>{editingUserId ? 'Guardar cambios' : 'Crear usuario'}</button>
                  </>
                ) : <EmptyState text="Solo el administrador principal puede crear o modificar usuarios." />}
              </article>
            </div>

            <article className="panel floating-card">
              <h3>Listado de usuarios</h3>
              <div className="event-table-wrap">
                <table className="event-table">
                  <thead>
                    <tr>
                      <th>Nombre</th>
                      <th>Usuario</th>
                      <th>Rol</th>
                      <th className="no-print">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr key={user.id}>
                        <td>{user.nombre}</td>
                        <td>{user.usuario}</td>
                        <td>{user.rol}</td>
                        <td className="no-print">
                          <div className="table-actions">
                            {isAdmin && <button className="ghost-btn small" onClick={() => startUserEdit(user)}>Modificar</button>}
                            {isAdmin && <button className="danger-btn small" onClick={() => removeUser(user.id)}>Borrar</button>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          </section>
        )}

        {activeTab === 'valores' && activeUser.rol === 'Administrador principal' && (
          <section className="page fade-in">
            <article className="panel floating-card no-print">
              <h3>Valores y descuentos</h3>
              {isAdmin ? (
                <>
                  <div className="form-grid compact">
                    <label>MenuKids 1<input type="number" value={valueEditor.menu1} onChange={(e) => setValueEditor((prev) => ({ ...prev, menu1: Number(e.target.value) }))} /></label>
                    <label>MenuKids 2<input type="number" value={valueEditor.menu2} onChange={(e) => setValueEditor((prev) => ({ ...prev, menu2: Number(e.target.value) }))} /></label>
                    <label>MenuKids 3<input type="number" value={valueEditor.menu3} onChange={(e) => setValueEditor((prev) => ({ ...prev, menu3: Number(e.target.value) }))} /></label>
                    <label>% descuento funcionario<input type="number" value={valueEditor.staffDiscountPct} onChange={(e) => setValueEditor((prev) => ({ ...prev, staffDiscountPct: Number(e.target.value) }))} /></label>
                  </div>
                  <button className="primary-btn" onClick={saveValues}>Guardar nuevos valores</button>
                </>
              ) : <EmptyState text="Acceso exclusivo para administrador principal." />}
            </article>

            <article className="panel floating-card">
              <h3>Historial de cambios</h3>
              <div className="event-table-wrap">
                <table className="event-table">
                  <thead>
                    <tr>
                      <th>Desde</th>
                      <th>MenuKids 1</th>
                      <th>MenuKids 2</th>
                      <th>MenuKids 3</th>
                      <th>% funcionario</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...valueHistory].reverse().map((item) => (
                      <tr key={item.effectiveAt}>
                        <td>{new Date(item.effectiveAt).toLocaleString('es-CL')}</td>
                        <td>{formatCurrency(item.prices['MenuKids 1'])}</td>
                        <td>{formatCurrency(item.prices['MenuKids 2'])}</td>
                        <td>{formatCurrency(item.prices['MenuKids 3'])}</td>
                        <td>{item.staffDiscountPct}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          </section>
        )}
      </main>
    </div>
  );
}

function BirthdaySheet({ event, canEdit, onEdit, onPrint, onChecklistChange }: {
  event: EventItem;
  canEdit: boolean;
  onEdit: () => void;
  onPrint: () => void;
  onChecklistChange: (eventId: string, updater: (checklist: Checklist) => Checklist) => void;
}) {
  return (
    <article className="panel floating-card printable-sheet print-only-area">
      <div className="panel-title-row no-print">
        <h3>Ficha completa del cumpleaños</h3>
        <div className="table-actions">
          {canEdit && <button className="ghost-btn" onClick={onEdit}>Editar</button>}
          <button className="primary-btn" onClick={onPrint}>Imprimir ficha</button>
        </div>
      </div>

      <div className="sheet-header">
        <div>
          <span className="eyebrow">Resumen del cumpleaños</span>
          <h2>{event.nombreEvento}</h2>
        </div>
        <span className={`status-pill status-${event.estado.toLowerCase()}`}>{event.estado}</span>
      </div>

      <div className="resume-badges">
        <span>👤 {event.nombreCliente}</span>
        <span>🎂 {event.edadCumple} años</span>
        <span>🏠 {event.sala}</span>
        <span>🎨 {event.tematica || 'Sin temática'}</span>
        <span>👥 {event.invitados} invitados</span>
        <span>🍽 {event.menu}</span>
      </div>

      <div className="sheet-grid">
        <section className="sheet-block">
          <h4>Contacto y responsable</h4>
          <p><strong>Responsable:</strong> {event.nombreCliente}</p>
          <p><strong>Teléfono:</strong> {event.telefono}</p>
          <p><strong>Creado por:</strong> {event.creadoPor}</p>
        </section>

        <section className="sheet-block">
          <h4>Detalle del cumpleaños</h4>
          <p><strong>Fecha:</strong> {prettyDate(event.fecha)}</p>
          <p><strong>Horario:</strong> {event.horario}</p>
          <p><strong>Menú:</strong> {event.menu}</p>
          <p><strong>Valor por invitado:</strong> {formatCurrency(event.valorPorInvitado)}</p>
          <p><strong>Total evento:</strong> {formatCurrency(event.totalFinal)}</p>
          <p><strong>Abono:</strong> {formatCurrency(event.abono)}</p>
          <p><strong>Por cobrar:</strong> {formatCurrency(Math.max(0, event.totalFinal - event.abono))}</p>
          <p><strong>Pago:</strong> {event.medioPagoAbono}</p>
          <p><strong>Observaciones:</strong> {event.observaciones || 'Sin observaciones.'}</p>
        </section>
      </div>

      <section className="sheet-block checklist-block">
        <h4>Checklist operativo</h4>
        <div className="checklist-grid">
          <label><input type="checkbox" checked={event.checklist.invitacionEnviada} onChange={() => onChecklistChange(event.id, (c) => ({ ...c, invitacionEnviada: !c.invitacionEnviada }))} /> Invitación enviada</label>
          <label><input type="checkbox" checked={event.checklist.pendonListo} onChange={() => onChecklistChange(event.id, (c) => ({ ...c, pendonListo: !c.pendonListo }))} /> Pendón listo</label>
          <label><input type="checkbox" checked={event.checklist.baseParaPadres} onChange={() => onChecklistChange(event.id, (c) => ({ ...c, baseParaPadres: !c.baseParaPadres }))} /> Base para padres</label>
          <label><input type="checkbox" checked={event.checklist.pintacarita} onChange={() => onChecklistChange(event.id, (c) => ({ ...c, pintacarita: !c.pintacarita }))} /> Pintacarita</label>
          <label className="arcade-check">
            <span><input type="checkbox" checked={event.checklist.tarjetasArcadeEntregar} onChange={() => onChecklistChange(event.id, (c) => ({ ...c, tarjetasArcadeEntregar: !c.tarjetasArcadeEntregar }))} /> Tarjetas Arcade a entregar</span>
            <input type="number" min={0} value={event.checklist.cantidadTarjetasArcade} onChange={(e) => onChecklistChange(event.id, (c) => ({ ...c, cantidadTarjetasArcade: Number(e.target.value) }))} />
          </label>
        </div>
      </section>
    </article>
  );
}

function SummaryEventCard({ event, onView }: { event: EventItem; onView: () => void }) {
  return (
    <div className="summary-card">
      <div>
        <strong>{event.nombreEvento}</strong>
        <span>{prettyDateShort(event.fecha)} · {event.horario}</span>
      </div>
      <button className="ghost-btn small" onClick={onView}>Ver ficha</button>
    </div>
  );
}

function MetricCard({ title, value, sub, onExport }: { title: string; value: string; sub: string; onExport: () => void }) {
  return (
    <div className="metric-card">
      <span>{title}</span>
      <strong>{value}</strong>
      <small>{sub}</small>
      <button className="ghost-btn small no-print" onClick={onExport}>Exportar Excel</button>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return <div className="stat-row"><span>{label}</span><strong>{value}</strong></div>;
}

function BarRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="bar-row">
      <div className="bar-label"><span>{label}</span><strong>{value}%</strong></div>
      <div className="bar-track"><div className="bar-fill" style={{ width: `${value}%` }} /></div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="empty-state">{text}</div>;
}

function buildMetrics(events: EventItem[]) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const weekKey = getWeekKey(now);
  const allSales = sum(events.map((event) => event.totalFinal));
  const allReceivable = sum(events.map((event) => Math.max(0, event.totalFinal - event.abono)));
  const weekEvents = events.filter((event) => getWeekKey(new Date(`${event.fecha}T00:00:00`)) === weekKey);
  const monthEvents = events.filter((event) => {
    const d = new Date(`${event.fecha}T00:00:00`);
    return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
  });
  const yearEvents = events.filter((event) => event.fecha.startsWith(String(currentYear)));

  const totalCapacity = 12 * Math.max(1, uniqueDates(events).length);
  const occupancy = Object.fromEntries(horarios.map((slot) => {
    const slotCount = events.filter((event) => event.horario === slot).length;
    const maxForSlot = 4 * Math.max(1, uniqueDates(events).length);
    return [slot, pct(slotCount, maxForSlot)];
  })) as Record<string, number>;

  const menuCounts = Object.fromEntries(menuKeys.map((menu) => [menu, events.filter((event) => event.menu === menu).length])) as Record<MenuKey, number>;
  const totalMenus = Math.max(1, sum(Object.values(menuCounts)));
  const menuPercentages = Object.fromEntries(menuKeys.map((menu) => [menu, pct(menuCounts[menu], totalMenus)])) as Record<MenuKey, number>;
  const topMenu = menuKeys.sort((a, b) => menuCounts[b] - menuCounts[a])[0] ?? 'MenuKids 1';

  const yearMonthDistribution = Array.from({ length: 12 }, (_, index) => {
    const count = yearEvents.filter((event) => new Date(`${event.fecha}T00:00:00`).getMonth() === index).length;
    return { label: monthNames[index], value: pct(count, Math.max(1, yearEvents.length)) };
  });

  const years = Array.from(new Set(events.map((event) => Number(event.fecha.slice(0, 4))))).sort((a, b) => a - b);
  const monthComparison = monthNames.map((month, index) => {
    const values: Record<number, number> = {};
    years.forEach((year) => {
      values[year] = events.filter((event) => {
        const d = new Date(`${event.fecha}T00:00:00`);
        return d.getFullYear() === year && d.getMonth() === index;
      }).length;
    });
    return { month, values };
  });

  return {
    week: { count: weekEvents.length, sales: sum(weekEvents.map((event) => event.totalFinal)) },
    month: { count: monthEvents.length, sales: sum(monthEvents.map((event) => event.totalFinal)) },
    year: { count: yearEvents.length, sales: sum(yearEvents.map((event) => event.totalFinal)) },
    all: { count: events.length, sales: allSales },
    accountsReceivable: allReceivable,
    occupancy,
    menuPercentages,
    topMenu,
    yearMonthDistribution,
    years,
    monthComparison,
  };
}

function buildCalendar(monthDate: Date, events: EventItem[]) {
  const start = startOfMonth(monthDate);
  const end = endOfMonth(monthDate);
  const startWeekday = (start.getDay() + 6) % 7;
  const cells = [] as Array<{ key: string; day: number; date: string; count: number; isCurrentMonth: boolean; isToday: boolean }>;
  const daysInMonth = end.getDate();

  for (let i = startWeekday - 1; i >= 0; i -= 1) {
    const d = addDays(start, -i - 1);
    cells.push(makeCalendarCell(d, false, events));
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    const d = new Date(start.getFullYear(), start.getMonth(), day);
    cells.push(makeCalendarCell(d, true, events));
  }
  while (cells.length % 7 !== 0) {
    const d = addDays(end, cells.length - (startWeekday + daysInMonth) + 1);
    cells.push(makeCalendarCell(d, false, events));
  }
  return cells;
}

function makeCalendarCell(date: Date, isCurrentMonth: boolean, events: EventItem[]) {
  const dateKey = isoDate(date);
  return {
    key: `${dateKey}_${isCurrentMonth}`,
    day: date.getDate(),
    date: dateKey,
    count: events.filter((event) => event.fecha === dateKey).length,
    isCurrentMonth,
    isToday: dateKey === isoDate(new Date()),
  };
}

function validateForm(form: FormState, events: EventItem[], editingEventId: string | null, valueHistory: MenuPriceVersion[], activeUser: User) {
if (!form.nombreEvento.trim()) {
  return 'Debes ingresar el nombre del evento';
}

if (!form.nombreCliente.trim()) {
  return 'Debes ingresar el nombre del cliente';
}

if (!form.telefono.trim()) {
  return 'Debes ingresar un número de teléfono';
}  if (form.invitados <= 0 || form.edadCumple <= 0) return 'Invitados y edad deben ser mayores a 0.';
  const totals = calculateEventTotals(form, valueHistory);
  if (form.abono > totals.total) return 'El abono no puede superar el valor total del evento.';
  const sameSlotCount = events.filter((event) => event.fecha === form.fecha && event.horario === form.horario && event.id !== editingEventId).length;
  if (sameSlotCount >= 4) return 'Ese horario ya completó sus 4 cupos.';
  const sameRoom = events.find((event) => event.fecha === form.fecha && event.horario === form.horario && event.sala === form.sala && event.id !== editingEventId);
  if (sameRoom) return 'Ya existe un cumpleaños en la misma sala y horario.';
  if (form.discountType === 'especial' && activeUser.rol !== 'Administrador principal') return 'Solo el administrador principal puede aplicar descuento especial.';
  return '';
}

function calculateEventTotals(form: FormState, valueHistory: MenuPriceVersion[], referenceDate?: string) {
  const valorPorInvitado = getPriceForMenu(form.menu, valueHistory, referenceDate);
  const subtotal = valorPorInvitado * Number(form.invitados || 0);
  let discountPct = 0;
  if (form.discountType === 'funcionario') discountPct = getLatestValues(valueHistory).staffDiscountPct;
  if (form.discountType === 'especial') discountPct = Number(form.specialDiscountPct || 0);
  const total = Math.max(0, Math.round(subtotal * (1 - discountPct / 100)));
  return {
    valorPorInvitado,
    subtotal,
    discountType: form.discountType,
    discountPct,
    total,
  };
}

function getPriceForMenu(menu: MenuKey, history: MenuPriceVersion[], referenceDate?: string) {
  const effective = history
    .filter((entry) => !referenceDate || entry.effectiveAt <= referenceDate)
    .sort((a, b) => a.effectiveAt.localeCompare(b.effectiveAt));
  const source = effective.length ? effective[effective.length - 1] : getLatestValues(history);
  return source.prices[menu];
}

function getLatestValues(history: MenuPriceVersion[]) {
  const sorted = [...history].sort((a, b) => a.effectiveAt.localeCompare(b.effectiveAt));
  return (sorted.length ? sorted[sorted.length - 1] : undefined) ?? defaultValueHistory[0];
}

function buildInitialForm(date: string, horario: string): FormState {
  return {
    nombreEvento: '',
    nombreCliente: '',
    telefono: '+569',
    fecha: date,
    horario,
    menu: 'MenuKids 1',
    tematica: '',
    sala: 'Sala 1',
    edadCumple: 1,
    invitados: 1,
    abono: 0,
    medioPagoAbono: 'Efectivo',
    observaciones: '',
    discountType: 'none',
    specialDiscountPct: 0,
  };
}

function createSeedEvent(partial: Partial<EventItem> & Pick<EventItem, 'fecha' | 'horario' | 'sala' | 'nombreEvento' | 'nombreCliente' | 'menu' | 'invitados' | 'edadCumple' | 'abono' | 'estado'>): EventItem {
  const price = defaultValueHistory[0].prices[partial.menu];
  const subtotal = partial.invitados * price;
  return {
    id: uid(),
    nombreEvento: partial.nombreEvento,
    nombreCliente: partial.nombreCliente,
    telefono: '+56912345678',
    fecha: partial.fecha,
    horario: partial.horario,
    menu: partial.menu,
    valorPorInvitado: price,
    tematica: 'Temática libre',
    sala: partial.sala,
    edadCumple: partial.edadCumple,
    invitados: partial.invitados,
    subtotal,
    discountType: 'none',
    discountPct: 0,
    totalFinal: subtotal,
    abono: partial.abono,
    medioPagoAbono: 'Transferencia',
    observaciones: '',
    estado: partial.estado,
    creadoPor: 'Administrador Principal',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    checklist: emptyChecklist(),
  };
}

function emptyChecklist(): Checklist {
  return {
    invitacionEnviada: false,
    pendonListo: false,
    baseParaPadres: false,
    pintacarita: false,
    tarjetasArcadeEntregar: false,
    cantidadTarjetasArcade: 0,
  };
}

function useLocalStorage<T>(key: string, fallback: T) {
  const [state, setState] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) as T : fallback;
    } catch {
      return fallback;
    }
  });

  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(state));
  }, [key, state]);

  return [state, setState] as const;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(value || 0);
}

function prettyDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function prettyDateShort(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function monthLabel(value: Date) {
  return value.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' });
}

function normalizePhone(phone: string) {
  return phone.startsWith('+569') ? phone : `+569${phone.replace(/\D/g, '').replace(/^56?9?/, '')}`;
}
function formatPhone(input: string) {
  // eliminar todo lo que no sea número
  let numbers = input.replace(/\D/g, '');

  // asegurar que empiece con 56
  if (!numbers.startsWith('56')) {
    numbers = '56' + numbers;
  }

  // limitar largo máximo (56 + 9 + 8 dígitos = 11)
  numbers = numbers.slice(0, 11);

  // formatear: +56 9 XXXX XXXX
  if (numbers.length <= 2) return `+${numbers}`;
  if (numbers.length <= 3) return `+${numbers.slice(0,2)} ${numbers.slice(2)}`;
  if (numbers.length <= 7) return `+${numbers.slice(0,2)} ${numbers.slice(2,3)} ${numbers.slice(3)}`;
  
  return `+${numbers.slice(0,2)} ${numbers.slice(2,3)} ${numbers.slice(3,7)} ${numbers.slice(7)}`;
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function isoDate(date: Date) {
  const d = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 10);
}

function offsetDate(days: number) {
  return addDays(new Date(), days);
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function tabIcon(tab: TabId) {
  return {
    inicio: '🏠',
    agenda: '🗓️',
    eventos: '🎈',
    reportes: '📊',
    usuarios: '👥',
    valores: '💲',
  }[tab];
}

function updateForm<T extends FormState, K extends keyof T>(setter: Dispatch<SetStateAction<T>>, key: K, value: T[K]) {
  setter((prev) => ({ ...prev, [key]: value }));
}

function sum(values: number[]) {
  return values.reduce((acc, value) => acc + value, 0);
}

function pct(value: number, total: number) {
  return Math.round((value / Math.max(1, total)) * 100);
}

function uniqueDates(events: EventItem[]) {
  return Array.from(new Set(events.map((event) => event.fecha)));
}

function getWeekKey(date: Date) {
  const temp = new Date(date);
  const day = (temp.getDay() + 6) % 7;
  temp.setDate(temp.getDate() - day);
  return isoDate(temp);
}

const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function toExportRow(event: EventItem) {
  return {
    Fecha: prettyDateShort(event.fecha),
    Horario: event.horario,
    Evento: event.nombreEvento,
    Responsable: event.nombreCliente,
    Teléfono: event.telefono,
    Menú: event.menu,
    'Valor por invitado': event.valorPorInvitado,
    Sala: event.sala,
    Temática: event.tematica,
    Edad: event.edadCumple,
    Invitados: event.invitados,
    Subtotal: event.subtotal,
    'Descuento %': event.discountPct,
    'Total final': event.totalFinal,
    Abono: event.abono,
    'Por cobrar': Math.max(0, event.totalFinal - event.abono),
    Estado: event.estado,
    Observaciones: event.observaciones,
  };
}

export default App;
