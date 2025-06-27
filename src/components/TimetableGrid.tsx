'use client'
import React, { useState, useEffect } from 'react';
import moment from 'moment';
import 'moment/locale/fr';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import type { DraggableProvided, DroppableProvided } from '@hello-pangea/dnd';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import autoTable from 'jspdf-autotable';

interface EventData {
    id: string | number;
    date: string;
    heure_debut: string;
    heure_fin?: string;
    type: string;
    cours: { nom: string };
    enseignants: { nom: string };
    salles: { nom: string };
}

interface TimetableGridProps {
    events: EventData[];
    currentDate: Date;
    sectionName?: string;
    niveau?: string;
    dateDebut?: string;
    dateFin?: string;
}

const TIME_SLOTS = [
  { start: '08:00', end: '09:30' },
  { start: '09:30', end: '11:00' },
  { start: '11:00', end: '12:30' },
  { start: '12:30', end: '13:30', lunch: true }, // Pause déjeuner
  { start: '13:30', end: '15:00' },
  { start: '15:00', end: '16:60' },
 
];

const DAYS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi'];

const typeColorMap: { [key: string]: string } = {
    'CM': 'bg-red-100 border-l-4 border-red-500',
    'TD': 'bg-purple-100 border-l-4 border-purple-500',
    'TP': 'bg-blue-100 border-l-4 border-blue-500',
    'Cours': 'bg-yellow-100 border-l-4 border-yellow-500',
};

// Ajout utilitaire classNames si manquant
function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(' ');
}

export default function TimetableGrid({ events, currentDate, sectionName, niveau, dateDebut, dateFin }: TimetableGridProps) {
    console.log('TimetableGrid events:', events);
    if (events.length > 0) {
      console.log('TimetableGrid first event detail:', events[0]);
    }
    // Ajoute une séance de test si events est vide
    const testEvent = {
        id: 'test',
        date: '2024-06-10',
        heure_debut: '08:00',
        heure_fin: '09:30',
        type: 'CM',
        cours: { nom: 'Test' },
        enseignants: { nom: 'Professeur Test' },
        salles: { nom: 'Salle 101' }
    };
    const [localEvents, setLocalEvents] = useState(events.length > 0 ? events : [testEvent]);
    const tableRef = React.useRef<HTMLDivElement>(null);
    
    const grid: (EventData[])[][] = Array(DAYS.length).fill(null).map(() => Array(TIME_SLOTS.length).fill(null).map(() => []));
    const weekStart = moment(currentDate).startOf('week');

    localEvents.forEach(event => {
        const eventDate = moment(event.date);
        const dayIndex = eventDate.diff(weekStart, 'days');
        const eventStartHour = event.heure_debut.substring(0, 5);
        const timeSlotIndex = TIME_SLOTS.findIndex(slot => slot.start === eventStartHour);
        console.log('GRID MAP', {
          weekStart: weekStart.format('YYYY-MM-DD'),
          eventDate: eventDate.format('YYYY-MM-DD'),
          dayIndex,
          timeSlotIndex,
          eventId: event.id
        });
        if (dayIndex >= 0 && dayIndex < DAYS.length && timeSlotIndex !== -1) {
            grid[dayIndex][timeSlotIndex].push(event);
        }
    });

    // Log détaillé pour chaque event
    localEvents.forEach(ev => {
      console.log('Event for grid:', {
        date: ev.date,
        heure_debut: ev.heure_debut,
        heure_fin: ev.heure_fin,
        type: ev.type,
        cours: ev.cours,
        enseignants: ev.enseignants,
        salles: ev.salles
      });
    });

    const handleDragEnd = (result: DropResult) => {
        console.log('Drag result:', result);
        if (!result.destination) return;
        const eventId = result.draggableId;
        const [newDayIndex, newGridIndex] = result.destination.droppableId.split('-').map(Number);
        if (newDayIndex > 4) return; // Empêcher le drop sur vendredi/samedi
        const weekStart = moment(currentDate).startOf('week');
        const newDate = weekStart.clone().add(newDayIndex, 'days').format('YYYY-MM-DD');
        const newHeure = TIME_SLOTS[newGridIndex].start;
        // Vérifier si la cellule cible est déjà occupée
        const alreadyExists = localEvents.some(ev => ev.date === newDate && ev.heure_debut === newHeure);
        if (alreadyExists) return; // Annuler le déplacement si la case est occupée
        setLocalEvents(prevEvents => {
            const movedEvent = prevEvents.find(event => String(event.id) === eventId);
            if (!movedEvent) return prevEvents;
            const filtered = prevEvents.filter(ev => String(ev.id) !== eventId);
            const updated = [
                ...filtered,
                {
                    ...movedEvent,
                    date: newDate,
                    heure_debut: newHeure,
                }
            ];
            console.log('Events after move:', updated);
            return updated;
        });
    };

    const exportPDF = async () => {
        console.log('Export PDF called');
        console.log('events used for PDF:', localEvents);
        const pdf = new jsPDF({ orientation: 'landscape' });
        // Ajoute un logo (si disponible)
        try {
            // Remplace le chemin par le tien si besoin
            const logoUrl = '/logo.png';
            const img = new window.Image();
            img.src = logoUrl;
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
            });
            pdf.addImage(img, 'PNG', 10, 8, 28, 28); // x, y, width, height
        } catch (e) {
            // Si le logo n'est pas trouvé, laisse un espace
            pdf.setDrawColor(200);
            pdf.rect(10, 8, 28, 28);
        }
        pdf.setFontSize(18);
        pdf.text('Emploi du temps', 45, 18);
        pdf.setFontSize(12);
        pdf.text(`Section : ${sectionName || '...'}`, 45, 28);
        pdf.text(`Niveau : ${niveau || '...'}`, 45, 36);
        pdf.text(`Période : ${dateDebut || '...'} au ${dateFin || '...'}`, 45, 44);
        pdf.setLineWidth(0.5);
        pdf.line(10, 48, pdf.internal.pageSize.getWidth() - 10, 48);

        // Pour debug : exporter tous les events, pas seulement ceux de la semaine affichée
        const filteredEvents = localEvents; // Pas de filtre sur la semaine
        console.log('filteredEvents for PDF:', filteredEvents);

        // Prépare la matrice [créneau][jour]
        const jours = DAYS;
        const creneaux = TIME_SLOTS.filter(slot => !slot.lunch);
        const grid = creneaux.map((slot, creneauIdx) =>
            jours.map((day, dayIdx) => {
                // Chercher l'event dont la date correspond exactement à la colonne (dimanche à jeudi)
                const cellDate = weekStart.clone().add(dayIdx, 'days').format('YYYY-MM-DD');
                const event = filteredEvents.find(ev =>
                    ev.date === cellDate &&
                    ev.heure_debut === slot.start
                );
                if (event) {
                    return [
                        event.cours?.nom || '',
                        event.enseignants?.nom || '',
                        event.salles?.nom || '',
                        `[${event.type}]`
                    ].filter(Boolean).join("\n");
                }
                return '';
            })
        );
        console.log('DAYS:', DAYS);
        console.log('TIME_SLOTS:', TIME_SLOTS);
        // En-tête du tableau : Heure + jours
        const head = [['Heure', ...jours]];
        const body = [];
        for (let i = 0; i < TIME_SLOTS.length; i++) {
            if (TIME_SLOTS[i].lunch) {
                body.push([
                    '13:00 - 14:00',
                    ...Array(DAYS.length).fill("PAUSE DÉJEUNER")
                ]);
            } else if (grid[body.length]) {
                body.push([TIME_SLOTS[i].start, ...grid[body.length]]);
            }
        }
        console.log('head for PDF:', head);
        console.log('body for PDF:', JSON.stringify(body, null, 2));
        autoTable(pdf, {
            head,
            body,
            startY: 52,
            styles: { fontSize: 14, cellPadding: 6, valign: 'middle', halign: 'center', minCellHeight: 18 },
            headStyles: { fillColor: [49, 46, 129], textColor: 255, fontStyle: 'bold' },
            bodyStyles: { textColor: 20 },
            alternateRowStyles: { fillColor: [240, 240, 255] },
            margin: { left: 10, right: 10 },
            theme: 'grid',
            didDrawCell: (data) => {
                if (data.section === 'body' && data.cell.raw && data.cell.raw !== '') {
                    pdf.setFillColor(232, 240, 254);
                    pdf.rect(data.cell.x, data.cell.y, data.cell.width, data.cell.height, 'F');
                }
            }
        });
        pdf.save('emploi-du-temps.pdf');
    };

    const exportPDFList = async () => {
        const pdf = new jsPDF({ orientation: 'landscape' });
        pdf.setFontSize(18);
        pdf.text('Liste des événements', 14, 18);
        pdf.setFontSize(12);
        const head = [['Date', 'Heure', 'Matière', 'Enseignant', 'Salle', 'Type']];
        const body = localEvents.map(ev => [
            ev.date,
            ev.heure_debut + (ev.heure_fin ? ' - ' + ev.heure_fin : ''),
            ev.cours?.nom || '',
            ev.enseignants?.nom || '',
            ev.salles?.nom || '',
            ev.type || ''
        ]);
        autoTable(pdf, {
            head,
            body,
            startY: 28,
            styles: { fontSize: 12, cellPadding: 6, valign: 'middle', halign: 'center', minCellHeight: 12 },
            headStyles: { fillColor: [49, 46, 129], textColor: 255, fontStyle: 'bold' },
            bodyStyles: { textColor: 20 },
            alternateRowStyles: { fillColor: [240, 240, 255] },
            margin: { left: 10, right: 10 },
            theme: 'grid',
        });
        pdf.save('liste-evenements.pdf');
    };

    const exportHTML = () => {
        const weekStart = moment(currentDate).startOf('week');
        const jours = DAYS;
        const creneaux = TIME_SLOTS.filter(slot => !slot.lunch);
        let html = `<!DOCTYPE html><html lang='fr'><head><meta charset='UTF-8'><title>Emploi du temps</title><style>table{border-collapse:collapse;width:100%}th,td{border:1px solid #888;padding:8px;text-align:center}th{background:#312e81;color:#fff}tr:nth-child(even){background:#f0f4ff}</style></head><body>`;
        html += `<h2>Emploi du temps du ${weekStart.format('DD/MM/YYYY')} au ${weekStart.clone().add(4, 'days').format('DD/MM/YYYY')}</h2>`;
        html += '<table><thead><tr><th>Heure</th>';
        for (const day of jours) html += `<th>${day}</th>`;
        html += '</tr></thead><tbody>';
        for (const slot of TIME_SLOTS) {
            if (slot.lunch) {
                html += `<tr><td colspan='${jours.length + 1}' style='background:#fffbe6;color:#b45309;font-weight:bold'>🥗 Pause Déjeuner (${slot.start} - ${slot.end})</td></tr>`;
            } else {
                html += `<tr><td>${slot.start} - ${slot.end}</td>`;
                for (let dayIdx = 0; dayIdx < jours.length; dayIdx++) {
                    const cellDate = weekStart.clone().add(dayIdx, 'days').format('YYYY-MM-DD');
                    const event = localEvents.find(ev => ev.date === cellDate && ev.heure_debut === slot.start);
                    if (event) {
                        html += `<td><b>${event.cours?.nom || ''}</b><br>${event.enseignants?.nom || ''}<br>${event.salles?.nom || ''}<br><span style='font-size:10px;color:#fff;background:#6366f1;border-radius:4px;padding:2px 4px'>${event.type || ''}</span></td>`;
                    } else {
                        html += '<td></td>';
                    }
                }
                html += '</tr>';
            }
        }
        html += '</tbody></table></body></html>';
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'emploi-du-temps.html';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const addTestEvent = () => {
        const weekStart = moment(currentDate).startOf('week');
        const testDate = weekStart.format('YYYY-MM-DD');
        setLocalEvents(prev => {
            // Vérifier s'il existe déjà un event pour ce créneau/date
            if (prev.some(ev => ev.date === testDate && ev.heure_debut === '08:00')) {
                return prev; // Ne rien ajouter si déjà présent
            }
            return [
                ...prev,
                {
                    id: Math.random().toString(36).slice(2),
                    date: testDate,
                    heure_debut: '08:00',
                    heure_fin: '09:30',
                    type: 'CM',
                    cours: { nom: 'Test Dimanche' },
                    enseignants: { nom: 'Professeur Test' },
                    salles: { nom: 'Salle 101' }
                }
            ];
        });
    };

    return (
        <>
        <style>{`
          .pdf-export, .pdf-export * {
            background: #fff !important;
            color: #000 !important;
            box-shadow: none !important;
            border-color: #000 !important;
            filter: none !important;
          }
        `}</style>
        <button
            onClick={exportPDF}
            className="mb-4 px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
        >
            Exporter en PDF (grille)
        </button>
        <button
            onClick={exportPDFList}
            className="mb-4 ml-2 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
        >
            Exporter tous les événements (liste)
        </button>
        <button
            onClick={exportHTML}
            className="mb-4 ml-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
            Exporter en HTML (grille)
        </button>
        <button
            onClick={addTestEvent}
            className="mb-4 ml-2 px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
        >
            Ajouter un événement de test
        </button>
        <DragDropContext onDragEnd={handleDragEnd}>
        <div ref={tableRef} className="overflow-x-auto shadow-md rounded-lg bg-white">
            <table className="min-w-full border-separate border-spacing-0">
                <thead>
                    <tr>
                        <th className="bg-indigo-600 text-white text-center font-bold px-4 py-3 rounded-tl-2xl w-32 sticky left-0 z-10">Heure</th>
                        {DAYS.map((day, idx) => (
                            <th key={day} className={classNames(
                                'bg-indigo-600 text-white text-center font-bold px-4 py-3',
                                idx === DAYS.length - 1 ? 'rounded-tr-2xl' : ''
                            )}>{day}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {TIME_SLOTS.map((slot, rowIdx) => (
                        slot.lunch ? (
                            <tr key="lunch">
                                <td className="bg-yellow-50 text-yellow-700 font-semibold text-center px-4 py-4 border-b border-indigo-100" colSpan={DAYS.length + 1}>
                                    🥗 Pause Déjeuner (12:30 - 13:30)
                                </td>
                                </tr>
                        ) : (
                            <tr key={slot.start}>
                                <td className="bg-indigo-50 text-indigo-700 font-semibold text-center px-4 py-3 border-b border-indigo-100 sticky left-0 z-10">
                                    {slot.start} - {slot.end}
                                </td>
                                {DAYS.map((day, dayIdx) => {
                                    const droppableId = `${dayIdx}-${rowIdx}`;
                                    const event = localEvents.find((ev: any) =>
                                        moment(ev.date).format('dddd').toLowerCase() === day.toLowerCase() &&
                                        ev.heure_debut === slot.start
                                    );
                                    return (
                                        <td key={day + slot.start} className="align-top px-2 py-2 border-b border-indigo-100 min-w-[160px]">
                                            <Droppable droppableId={droppableId}>
                                                {(provided) => (
                                                    <div ref={provided.innerRef} {...provided.droppableProps} className="h-full min-h-[48px]">
                                                        {event ? (
                                                            <Draggable draggableId={String(event.id)} index={0}>
                                                                {(provided) => (
                                                                    <div
                                                                        ref={provided.innerRef}
                                                                        {...provided.draggableProps}
                                                                        {...provided.dragHandleProps}
                                                                        onDoubleClick={() => {
                                                                            if (window.confirm('Voulez-vous supprimer ce créneau ?')) {
                                                                                setLocalEvents(prev => prev.filter(ev => String(ev.id) !== String(event.id)));
                                                                            }
                                                                        }}
                                                                        className="flex flex-col gap-1 bg-indigo-50 border border-indigo-200 rounded-lg p-2 shadow-sm cursor-move"
                                                                    >
                                                                        <span className="inline-block bg-indigo-100 text-indigo-800 text-xs font-bold px-2 py-1 rounded-lg mb-1 shadow-sm">
                                                                            {event.cours?.nom}
                                                                        </span>
                                                                        <span className="text-xs text-gray-700 font-medium">{event.enseignants?.nom}</span>
                                                                        <span className="text-xs text-gray-500">{event.salles?.nom}</span>
                                                                        {event.type && <span className="text-[10px] text-white bg-indigo-400 rounded px-1 py-0.5 mt-1">{event.type}</span>}
                                                                    </div>
                                                                )}
                                                            </Draggable>
                                                        ) : (
                                                            <span className="text-gray-300 text-xs">—</span>
                                                        )}
                                                        {provided.placeholder}
                                                </div>
                                            )}
                                            </Droppable>
                                        </td>
                                    );
                                })}
                            </tr>
                        )
                    ))}
                </tbody>
            </table>
        </div>
        </DragDropContext>
        </>
    );
}