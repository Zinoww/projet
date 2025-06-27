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
    
useEffect(() => {
  setLocalEvents(events); // ou la source initiale de tes cours
}, [events]);
    console.log('TimetableGrid localEvents:', localEvents);

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

  

    const handleDragEnd = (result: DropResult) => {
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
            return updated;
        });
    };

const exportPDF = async () => {
    const pdf = new jsPDF({ 
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
    });

    // Configuration de moment.js pour la locale française
    moment.locale('fr', {
        week: {
            dow: 0, // Dimanche comme premier jour
            doy: 4
        }
    });

    // Palette de couleurs élégante
    const styles = {
        // Dégradé bleu sophistiqué
        primaryDark: [30, 58, 138], // Indigo-800
        primaryMedium: [67, 56, 202], // Indigo-700
        primaryLight: [129, 140, 248], // Indigo-400
        
        // Couleurs de fond
        headerBg: [30, 58, 138],
        headerText: [255, 255, 255],
        rowEvenBg: [248, 250, 252], // Slate-50
        rowOddBg: [255, 255, 255],
        
        // Bordures et ombres
        border: [203, 213, 225], // Slate-300
        shadowColor: [71, 85, 105], // Slate-600
        
        // Pause déjeuner - tons dorés
        lunchBg: [254, 240, 138], // Yellow-200
        lunchBorder: [217, 119, 6], // Yellow-600
        lunchText: [146, 64, 14], // Yellow-800
        
        // Événements - tons subtils
        eventBg: [241, 245, 249], // Slate-100
        eventBorder: [148, 163, 184], // Slate-400
        eventText: [51, 65, 85], // Slate-700
        
        // Types de cours - couleurs distinctives
        typeCM: [239, 68, 68], // Red-500
        typeTD: [168, 85, 247], // Purple-500
        typeTP: [59, 130, 246], // Blue-500
        typeCours: [245, 158, 11], // Amber-500
        
        // Texte
        titleText: [15, 23, 42], // Slate-900
        subtitleText: [71, 85, 105], // Slate-600
        bodyText: [51, 65, 85] // Slate-700
    };

    // === EN-TÊTE ÉLÉGANT ===
    // Fond dégradé pour l'en-tête
    pdf.setFillColor(styles.primaryDark[0], styles.primaryDark[1], styles.primaryDark[2]);
    pdf.roundedRect(10, 8, 277, 32, 4, 4, 'F');
    
    // Ombre subtile sous l'en-tête
    pdf.setFillColor(0, 0, 0, 0.1);
    pdf.roundedRect(11, 9, 277, 32, 4, 4, 'F');
    
    // Titre principal avec typographie élégante
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(22);
    pdf.setTextColor(255, 255, 255);
    pdf.text('EMPLOI DU TEMPS HEBDOMADAIRE', 148.5, 20, { align: 'center' });
    
    // Sous-titre avec style moderne
    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(220, 220, 220);
    pdf.text('Planning académique', 148.5, 27, { align: 'center' });
    
    // Informations détaillées avec icônes stylisées
    pdf.setFontSize(10);
    pdf.setTextColor(styles.subtitleText[0], styles.subtitleText[1], styles.subtitleText[2]);
    
    // Ligne d'informations avec séparateurs élégants
    const infoY = 35;
    pdf.text(`Section: ${sectionName || 'Non spécifiée'}`, 15, infoY);
    pdf.text('•', 75, infoY);
    pdf.text(`Niveau: ${niveau || 'Non spécifié'}`, 80, infoY);
    pdf.text('•', 140, infoY);
    pdf.text(`Période: ${dateDebut || '...'} au ${dateFin || '...'}`, 145, infoY);

    // === CONFIGURATION DU TABLEAU ÉLÉGANT ===
    const margin = 12;
    const tableWidth = 273;
    const colWidth = tableWidth / (DAYS.length + 1);
    const rowHeight = 18; // Plus d'espace pour plus d'élégance
    let yPos = 45;

    // Ombre du tableau pour profondeur
    pdf.setFillColor(0, 0, 0, 0.08);
    pdf.roundedRect(margin + 1, yPos + 1, tableWidth, rowHeight + (TIME_SLOTS.length * rowHeight), 3, 3, 'F');

    // En-tête du tableau avec style moderne
    pdf.setFillColor(styles.headerBg[0], styles.headerBg[1], styles.headerBg[2]);
    pdf.roundedRect(margin, yPos, tableWidth, rowHeight, 3, 3, 'F');
    
    // Effet de dégradé sur l'en-tête (simulation)
    pdf.setFillColor(styles.primaryMedium[0], styles.primaryMedium[1], styles.primaryMedium[2]);
    pdf.rect(margin, yPos + rowHeight - 3, tableWidth, 1, 'F');
    
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.setTextColor(styles.headerText[0], styles.headerText[1], styles.headerText[2]);
    pdf.text('HORAIRES', margin + 8, yPos + 12);
    
    DAYS.forEach((day, index) => {
        const dayX = margin + colWidth * (index + 1) + colWidth/2;
        pdf.text(day.toUpperCase(), dayX, yPos + 12, { align: 'center' });
    });

    yPos += rowHeight;

    // === CORPS DU TABLEAU AVEC STYLE ÉLÉGANT ===
    TIME_SLOTS.forEach((slot, slotIndex) => {
        // Pause déjeuner avec design sophistiqué
        if (slot.lunch) {
            // Fond avec bordure dorée élégante
            pdf.setFillColor(styles.lunchBg[0], styles.lunchBg[1], styles.lunchBg[2]);
            pdf.roundedRect(margin, yPos, tableWidth, rowHeight, 2, 2, 'F');
            
            // Bordure dorée subtile
            pdf.setDrawColor(styles.lunchBorder[0], styles.lunchBorder[1], styles.lunchBorder[2]);
            pdf.setLineWidth(0.5);
            pdf.roundedRect(margin, yPos, tableWidth, rowHeight, 2, 2, 'S');
            
            // Texte élégant centré
            pdf.setTextColor(styles.lunchText[0], styles.lunchText[1], styles.lunchText[2]);
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(12);
            pdf.text(` PAUSE DÉJEUNER  •  ${slot.start} - ${slot.end}`, 
                     margin + tableWidth / 2, yPos + 12, { align: 'center' });
            pdf.setFont('helvetica', 'normal');
            
            yPos += rowHeight;
            return;
        }

        // Alternance des couleurs avec style moderne
        const isEven = slotIndex % 2 === 0;
        if (isEven) {
            pdf.setFillColor(styles.rowEvenBg[0], styles.rowEvenBg[1], styles.rowEvenBg[2]);
            pdf.rect(margin, yPos, tableWidth, rowHeight, 'F');
        }

        // Colonne des heures avec style distinct
        pdf.setFillColor(styles.primaryLight[0], styles.primaryLight[1], styles.primaryLight[2]);
        pdf.rect(margin, yPos, colWidth, rowHeight, 'F');
        
        pdf.setTextColor(255, 255, 255);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(10);
        pdf.text(`${slot.start}`, margin + colWidth/2, yPos + 8, { align: 'center' });
        pdf.text(`${slot.end}`, margin + colWidth/2, yPos + 14, { align: 'center' });
        pdf.setFont('helvetica', 'normal');

        // Événements pour chaque jour avec design moderne
        DAYS.forEach((day, dayIndex) => {
            const dayName = day.toLowerCase();
            const event = localEvents.find(ev => 
                moment(ev.date).format('dddd').toLowerCase() === dayName && 
                ev.heure_debut === slot.start
            );

            if (event) {
                const cellX = margin + colWidth * (dayIndex + 1);
                const cellY = yPos;
                
                // Fond de l'événement avec ombre subtile
                pdf.setFillColor(styles.eventBg[0], styles.eventBg[1], styles.eventBg[2]);
                pdf.roundedRect(cellX + 1, cellY + 1, colWidth - 2, rowHeight - 2, 2, 2, 'F');
                
                // Bordure gauche colorée selon le type
                let typeColor;
                switch(event.type) {
                    case 'CM': typeColor = styles.typeCM; break;
                    case 'TD': typeColor = styles.typeTD; break;
                    case 'TP': typeColor = styles.typeTP; break;
                    default: typeColor = styles.typeCours; break;
                }
                
                pdf.setFillColor(typeColor[0], typeColor[1], typeColor[2]);
                pdf.rect(cellX + 1, cellY + 1, 2, rowHeight - 2, 'F');
                
                // Contenu de l'événement avec typographie soignée
                const textX = cellX + 6;
                let textY = cellY + 6;
                
                // Nom du cours (titre principal)
                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(9);
                pdf.setTextColor(styles.titleText[0], styles.titleText[1], styles.titleText[2]);
                pdf.text(event.cours?.nom || '', textX, textY);
                textY += 4;
                
                // Enseignant
                pdf.setFont('helvetica', 'normal');
                pdf.setFontSize(8);
                pdf.setTextColor(styles.subtitleText[0], styles.subtitleText[1], styles.subtitleText[2]);
                pdf.text(` ${event.enseignants?.nom || ''}`, textX, textY);
                textY += 3;
                
                // Salle
                pdf.text(` ${event.salles?.nom || ''}`, textX, textY);
                
                // Badge type moderne dans le coin
                if (event.type) {
                    const badgeWidth = 18;
                    const badgeHeight = 6;
                    const badgeX = cellX + colWidth - badgeWidth - 3;
                    const badgeY = cellY + 2;
                    
                    pdf.setFillColor(typeColor[0], typeColor[1], typeColor[2]);
                    pdf.roundedRect(badgeX, badgeY, badgeWidth, badgeHeight, 2, 2, 'F');
                    
                    pdf.setTextColor(255, 255, 255);
                    pdf.setFont('helvetica', 'bold');
                    pdf.setFontSize(7);
                    pdf.text(event.type, badgeX + badgeWidth/2, badgeY + 4, { align: 'center' });
                    pdf.setFont('helvetica', 'normal');
                }
            }
        });

        yPos += rowHeight;
    });

    // === BORDURES ÉLÉGANTES ET FINITIONS ===
    pdf.setDrawColor(styles.border[0], styles.border[1], styles.border[2]);
    pdf.setLineWidth(0.3);
    
    // Bordure principale du tableau avec coins arrondis
    pdf.roundedRect(margin, 45, tableWidth, yPos - 45, 3, 3, 'S');
    
    // Lignes de séparation verticales subtiles
    for (let i = 1; i <= DAYS.length; i++) {
        const x = margin + colWidth * i;
        pdf.setDrawColor(styles.border[0], styles.border[1], styles.border[2]);
        pdf.setLineWidth(0.2);
        pdf.line(x, 45 + rowHeight, x, yPos);
    }
    
    // Lignes de séparation horizontales subtiles (sauf pause déjeuner)
    let currentY = 45 + rowHeight;
    TIME_SLOTS.forEach((slot) => {
        if (!slot.lunch) {
            pdf.setDrawColor(styles.border[0], styles.border[1], styles.border[2]);
            pdf.setLineWidth(0.1);
            pdf.line(margin + colWidth, currentY, margin + tableWidth, currentY);
        }
        currentY += rowHeight;
    });

    // === PIED DE PAGE ÉLÉGANT ===
    const footerY = yPos + 15;
    
    // Ligne décorative
    pdf.setDrawColor(styles.primaryLight[0], styles.primaryLight[1], styles.primaryLight[2]);
    pdf.setLineWidth(1);
    pdf.line(margin, footerY, margin + tableWidth, footerY);
    
    // Informations du pied de page
    pdf.setFont('helvetica', 'italic');
    pdf.setFontSize(8);
    pdf.setTextColor(styles.subtitleText[0], styles.subtitleText[1], styles.subtitleText[2]);
    
    const now = new Date();
    const dateString = now.toLocaleDateString('fr-FR', { 
        day: 'numeric', 
        month: 'long', 
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
    
    pdf.text(`Généré le ${dateString}`, margin, footerY + 8);
    pdf.text('Planning académique automatisé', margin + tableWidth - 60, footerY + 8);

    // === LÉGENDE DES TYPES DE COURS ===
    const legendY = footerY + 15;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.setTextColor(styles.titleText[0], styles.titleText[1], styles.titleText[2]);
    pdf.text('LÉGENDE :', margin, legendY);
    
    const legendItems = [
        { type: 'CM', color: styles.typeCM, label: 'Cours Magistral' },
        { type: 'TD', color: styles.typeTD, label: 'Travaux Dirigés' },
        { type: 'TP', color: styles.typeTP, label: 'Travaux Pratiques' },
        { type: 'Cours', color: styles.typeCours, label: 'Cours Standard' }
    ];
    
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    
    legendItems.forEach((item, index) => {
        const x = margin + 35 + (index * 60);
        
        // Petit carré coloré
        pdf.setFillColor(item.color[0], item.color[1], item.color[2]);
        pdf.roundedRect(x, legendY - 3, 4, 4, 1, 1, 'F');
        
        // Texte de la légende
        pdf.setTextColor(styles.bodyText[0], styles.bodyText[1], styles.bodyText[2]);
        pdf.text(`${item.type} - ${item.label}`, x + 7, legendY);
    });

    pdf.save('emploi-du-temps-elegant.pdf');
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
    const jours = DAYS;
    const creneaux = TIME_SLOTS.filter(slot => !slot.lunch);
    
    let html = `<!DOCTYPE html><html lang='fr'><head><meta charset='UTF-8'><title>Emploi du temps</title><style>table{border-collapse:collapse;width:100%}th,td{border:1px solid #888;padding:8px;text-align:center}th{background:#312e81;color:#fff}tr:nth-child(even){background:#f0f4ff}</style></head><body>`;
    html += `<h2>Emploi du temps hebdomadaire</h2>`;
    html += '<table><thead><tr><th>Heure</th>';
    for (const day of jours) html += `<th>${day}</th>`;
    html += '</tr></thead><tbody>';
    
    for (const slot of TIME_SLOTS) {
        if (slot.lunch) {
            html += `<tr><td colspan='${jours.length + 1}' style='background:#fffbe6;color:#b45309;font-weight:bold'>🥗 Pause Déjeuner (${slot.start} - ${slot.end})</td></tr>`;
        } else {
            html += `<tr><td>${slot.start} - ${slot.end}</td>`;
            for (let dayIdx = 0; dayIdx < jours.length; dayIdx++) {
                const dayName = jours[dayIdx].toLowerCase();
                const event = localEvents.find(ev => 
                    moment(ev.date).format('dddd').toLowerCase() === dayName && 
                    ev.heure_debut === slot.start
                );

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