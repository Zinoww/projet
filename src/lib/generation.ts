import { supabase } from '@/src/lib/supabaseClient'

// --- 1. TYPE DEFINITIONS ---

interface Creneau {
    debut: string; // "HH:mm:ss"
    fin: string;
}

interface EmploiDuTempsItem {
    seance_id: string;
    jour: string;
    heure_debut: string;
    heure_fin: string;
    salle_id: string;
}

// --- 2. HELPER FUNCTIONS ---

function shuffle<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// Fonction de diagnostic simplifiée pour éviter les problèmes de performance
export async function diagnostiquerDonneesSimple(sectionId: string): Promise<string> {
    let rapport = '=== DIAGNOSTIC SIMPLIFIÉ ===\n\n';
    
    try {
        // 1. Vérifier la section
        const { data: section, error: sectionError } = await supabase
            .from('sections')
            .select('nom')
            .eq('id', sectionId)
            .single();
        
        if (sectionError || !section) {
            rapport += `❌ Section ${sectionId} non trouvée\n`;
            return rapport;
        }
        
        rapport += `✅ Section: ${section.nom}\n\n`;
        
        // 2. Compter les groupes de cette section
        const { count: nbGroupes, error: groupesError } = await supabase
            .from('groupes')
            .select('*', { count: 'exact', head: true })
            .eq('section_id', sectionId);
        
        if (groupesError) {
            rapport += `❌ Erreur groupes: ${groupesError.message}\n`;
            return rapport;
        }
        
        rapport += `📊 Groupes dans cette section: ${nbGroupes || 0}\n\n`;
        
        // 3. Compter les séances totales pour cette section
        const { data: groupes, error: groupesDataError } = await supabase
            .from('groupes')
            .select('id')
            .eq('section_id', sectionId);
        
        if (groupesDataError || !groupes) {
            rapport += `❌ Erreur récupération groupes: ${groupesDataError?.message}\n`;
            return rapport;
        }

        const groupeIds = groupes.map(g => g.id);
        const { count: nbSeances, error: seancesError } = await supabase
            .from('seances')
            .select('*', { count: 'exact', head: true })
            .in('groupe_id', groupeIds);
        
        if (seancesError) {
            rapport += `❌ Erreur séances: ${seancesError.message}\n`;
            return rapport;
        }
        
        rapport += `📊 Total des séances pour cette section: ${nbSeances || 0}\n\n`;
        
        // 4. Analyser les types de séances
        if (nbSeances && nbSeances > 0) {
            const { data: seancesDetails, error: detailsError } = await supabase
                .from('seances')
                .select('id, duree_minutes, cours_id, type_id, groupe_id, cours(nom), types_seances(nom), enseignants(nom)')
                .in('groupe_id', groupeIds)
                .limit(10);
            
            if (detailsError) {
                rapport += `❌ Erreur détails séances: ${detailsError.message}\n`;
            } else {
                rapport += `📋 Analyse des séances:\n`;
                
                // Compter par type
                const typesCount: { [key: string]: number } = {};
                seancesDetails?.forEach((seance: unknown) => {
                    const seanceData = seance as { types_seances?: { nom: string } };
                    const type = (seanceData.types_seances?.nom || 'Inconnu');
                    typesCount[type] = (typesCount[type] || 0) + 1;
                });
                
                Object.entries(typesCount).forEach(([type, count]) => {
                    rapport += `  • ${type}: ${count} séance(s)\n`;
                });
                
                rapport += '\n';
            }
        }
        
        rapport += '=== RECOMMANDATIONS ===\n';
        if (!nbGroupes || nbGroupes === 0) {
            rapport += '1. Créez des groupes pour cette section\n';
        }
        if (!nbSeances || nbSeances === 0) {
            rapport += '2. Créez des séances pour les groupes de cette section\n';
        }
        if (nbGroupes && nbGroupes > 0 && nbSeances && nbSeances > 0) {
            rapport += '3. Vérifiez que les séances ont des types appropriés (CM, TD, TP)\n';
            rapport += '4. Assurez-vous d\'avoir des salles avec des capacités appropriées\n';
        }
        
    } catch (error) {
        rapport += `❌ Erreur générale: ${error}\n`;
    }
    
    return rapport;
}

// --- 3. CORE GENERATION LOGIC ---

export async function genererEmploiDuTemps(
    sectionId: string, 
    setMessage: (msg: string) => void,
    niveau?: string
): Promise<boolean> {
    // --- Étape 1: Récupération des données ---
    setMessage('1/6 - Récupération des données...');

    // a. Récupérer tous les groupes de la section
    const { data: groupes, error: groupesError } = await supabase
        .from('groupes')
        .select('id, nom, niveau, specialite, section_id')
        .eq('section_id', sectionId)
        .order('nom');

    if (groupesError || !groupes || groupes.length === 0) {
        setMessage('Aucun groupe trouvé pour cette section.');
        return false;
    }

    const groupeIds = groupes.map(g => g.id);

    // b. Récupérer TOUS les cours du niveau si spécifié
    let coursIds: string[] = [];
    if (niveau) {
        setMessage(`1/6 - Récupération de TOUS les cours du niveau ${niveau}...`);
        const { data: cours, error: coursError } = await supabase
            .from('cours')
            .select('id, nom')
            .eq('niveau', niveau);
        
        if (coursError || !cours || cours.length === 0) {
            setMessage(`Aucun cours trouvé pour le niveau ${niveau}.`);
            return false;
        }
        
        coursIds = cours.map(c => c.id);
        console.log(`Cours trouvés pour ${niveau}:`, cours.map(c => c.nom));
    }

    // c. Récupérer toutes les séances de ces groupes ET cours
    let seancesQuery = supabase
        .from('seances')
        .select('*, cours(nom, niveau), types_seances(nom), enseignants(nom)')
        .in('groupe_id', groupeIds);

    // Si un niveau est spécifié, filtrer par les cours de ce niveau
    if (niveau && coursIds.length > 0) {
        seancesQuery = seancesQuery.in('cours_id', coursIds);
    }

    const { data: seances, error: seancesError } = await seancesQuery;

    if (seancesError || !seances || seances.length === 0) {
        const message = niveau ? 
            `Erreur ou aucune séance à planifier pour cette section au niveau ${niveau}. ${seancesError?.message || ''}` :
            `Erreur ou aucune séance à planifier pour cette section. ${seancesError?.message || ''}`;
        setMessage(message);
        return false;
    }

    // Afficher le résumé des séances trouvées
    const coursTrouves = [...new Set(seances.map(s => (s.cours as { nom: string })?.nom))];
    console.log(`Séances trouvées pour ${niveau || 'tous niveaux'}:`, {
        totalSeances: seances.length,
        coursConcernes: coursTrouves,
        groupesConcernes: groupes.length
    });

    // d. Récupérer toutes les salles
    const { data: salles, error: sallesError } = await supabase.from('salles').select('id, nom, capacite');
    if (sallesError || !salles || salles.length === 0) {
        setMessage(`Erreur ou aucune salle disponible. ${sallesError?.message || ''}`);
        return false;
    }

    // Séparer les amphis des salles normales
    const amphis = salles.filter(s => 
        s.nom.toLowerCase().includes('amphi') || 
        s.nom.toLowerCase().includes('amphithéâtre') ||
        s.nom.toLowerCase().includes('auditorium') ||
        (s.capacite && s.capacite >= 100) // Salles avec grande capacité considérées comme amphis
    );
    const sallesNormales = salles.filter(s => 
        !s.nom.toLowerCase().includes('amphi') && 
        !s.nom.toLowerCase().includes('amphithéâtre') &&
        !s.nom.toLowerCase().includes('auditorium') &&
        (!s.capacite || s.capacite < 100) // Salles avec capacité normale
    );

    console.log(`Salles disponibles:`, salles.map(s => `${s.nom} (${s.capacite} places)`));
    console.log(`Amphis disponibles:`, amphis.map(s => `${s.nom} (${s.capacite} places)`));
    console.log(`Salles normales disponibles:`, sallesNormales.map(s => `${s.nom} (${s.capacite} places)`));

    // --- Étape 2: Organisation des séances par type ---
    setMessage('2/6 - Organisation des séances par type...');

    // Séparer les séances par type
    const seancesCM = seances.filter(s => (s.types_seances as { nom: string })?.nom?.toLowerCase().includes('cm'));
    const seancesTD = seances.filter(s => (s.types_seances as { nom: string })?.nom?.toLowerCase().includes('td'));
    const seancesTP = seances.filter(s => (s.types_seances as { nom: string })?.nom?.toLowerCase().includes('tp'));

    console.log(`Séances trouvées: ${seancesCM.length} CM, ${seancesTD.length} TD, ${seancesTP.length} TP`);
    console.log(`Groupes dans la section: ${groupes.length} (${groupes.map(g => g.nom).join(', ')})`);
    console.log(`Capacité nécessaire pour CM: ${groupes.length * 30} étudiants`);

    // --- Étape 3: Initialisation du planning ---
    setMessage('3/6 - Initialisation du planning...');
    const jours = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi'];
    const creneaux: Creneau[] = [
        { debut: '08:00:00', fin: '09:30:00' },
        { debut: '09:30:00', fin: '11:00:00' },
        { debut: '11:00:00', fin: '12:30:00' },
        { debut: '13:30:00', fin: '15:00:00' },
        { debut: '15:00:00', fin: '16:30:00' }
    ];

    const planning: EmploiDuTempsItem[] = [];
    const planningGroupes: { [key: string]: { [key: string]: string[] } } = {}; // jour -> créneau -> groupes

    // Initialiser la structure de suivi des groupes
    jours.forEach(jour => {
        planningGroupes[jour] = {};
        creneaux.forEach(creneau => {
            planningGroupes[jour][creneau.debut] = [];
        });
    });

    // --- Étape 4: Placement des CM (tous les groupes ensemble) ---
    setMessage('4/6 - Placement des cours magistraux...');

    const sessionsNonPlacees: string[] = [];

    for (const seanceCM of seancesCM) {
        let placee = false;
        
        for (const jour of shuffle(jours)) {
            for (const creneau of shuffle(creneaux)) {
                // Vérifier si aucun groupe n'est occupé à ce créneau
                const groupesOccupe = planningGroupes[jour][creneau.debut].length > 0;
                if (groupesOccupe) continue;

                // Vérifier si l'enseignant est disponible
                if (seanceCM.enseignant_id) {
                    const enseignantOccupe = planning.some(p => {
                        const seancePlanifiee = seances.find(s => s.id === p.seance_id);
                        return seancePlanifiee?.enseignant_id === seanceCM.enseignant_id && 
                               p.jour === jour && p.heure_debut === creneau.debut;
                    });
                    if (enseignantOccupe) continue;
                }

                // Trouver une salle appropriée (plus grande capacité pour CM)
                const salleCM = amphis.find(s => s.capacite && s.capacite >= groupes.length * 30); // Estimation 30 étudiants par groupe
                if (!salleCM) continue;

                // Vérifier si la salle est libre
                const salleOccupee = planning.some(p => 
                    p.salle_id === salleCM.id && p.jour === jour && p.heure_debut === creneau.debut
                );
                if (salleOccupee) continue;

                // Placer le CM
                planning.push({
                    seance_id: seanceCM.id,
                    jour: jour,
                    heure_debut: creneau.debut,
                    heure_fin: creneau.fin,
                    salle_id: salleCM.id
                });

                // Marquer tous les groupes comme occupés
                groupes.forEach(groupe => {
                    if (!planningGroupes[jour][creneau.debut].includes(groupe.id)) {
                        planningGroupes[jour][creneau.debut].push(groupe.id);
                    }
                });

                placee = true;
                break;
            }
            if (placee) break;
        }

        if (!placee) {
            const nomCours = (seanceCM.cours as { nom: string })?.nom || 'Cours inconnu';
            sessionsNonPlacees.push(`CM: ${nomCours}`);
            console.log(`Impossible de placer le CM: ${nomCours}`);
            
            // Debug: Vérifier les contraintes
            const capaciteNecessaire = groupes.length * 30;
            const sallesAdequates = amphis.filter(s => s.capacite && s.capacite >= capaciteNecessaire);
            console.log(`Amphis avec capacité ≥${capaciteNecessaire}: ${sallesAdequates.map(s => s.nom).join(', ')}`);
            console.log(`Total amphis disponibles: ${amphis.length}`);
            
            if (seanceCM.enseignant_id) {
                const enseignant = seances.find(s => s.id === seanceCM.id)?.enseignants as { nom: string };
                console.log(`Enseignant: ${enseignant?.nom || 'Non assigné'}`);
            }
        }
    }

    // --- Étape 5: Placement des TD/TP (groupes séparés avec partage possible) ---
    setMessage('5/6 - Placement des TD/TP...');

    const seancesTDTP = [...seancesTD, ...seancesTP];
    
    for (const seance of seancesTDTP) {
        let placee = false;
        
        for (const jour of shuffle(jours)) {
            for (const creneau of shuffle(creneaux)) {
                // Vérifier si le groupe de cette séance est déjà occupé
                const groupeOccupe = planningGroupes[jour][creneau.debut].includes(seance.groupe_id);
                if (groupeOccupe) continue;

                // Vérifier si l'enseignant est disponible
                if (seance.enseignant_id) {
                    const enseignantOccupe = planning.some(p => {
                        const seancePlanifiee = seances.find(s => s.id === p.seance_id);
                        return seancePlanifiee?.enseignant_id === seance.enseignant_id && 
                               p.jour === jour && p.heure_debut === creneau.debut;
                    });
                    if (enseignantOccupe) continue;
                }

                // Trouver une salle appropriée
                const salle = sallesNormales.find(s => s.capacite && s.capacite >= 30); // Capacité pour un groupe
                if (!salle) continue;

                // Vérifier si la salle est libre ou peut être partagée
                const seancesDansSalle = planning.filter(p => 
                    p.salle_id === salle.id && p.jour === jour && p.heure_debut === creneau.debut
                );

                if (seancesDansSalle.length > 0) {
                    // Vérifier si on peut partager la salle (même type de séance)
                    const seanceExistante = seances.find(s => s.id === seancesDansSalle[0].seance_id);
                    const memeType = (seance.types_seances as { nom: string })?.nom === (seanceExistante?.types_seances as { nom: string })?.nom;
                    
                    if (!memeType) continue; // Types différents, ne peut pas partager
                    
                    // Vérifier la capacité de la salle pour plusieurs groupes
                    const groupesDansSalle = planningGroupes[jour][creneau.debut].length;
                    if (salle.capacite && salle.capacite < (groupesDansSalle + 1) * 30) continue;
                }

                // Placer la séance
                planning.push({
                    seance_id: seance.id,
                    jour: jour,
                    heure_debut: creneau.debut,
                    heure_fin: creneau.fin,
                    salle_id: salle.id
                });

                // Marquer le groupe comme occupé
                planningGroupes[jour][creneau.debut].push(seance.groupe_id);

                placee = true;
                break;
            }
            if (placee) break;
        }

        if (!placee) {
            const nomCours = (seance.cours as { nom: string })?.nom || 'Cours inconnu';
            const typeSeance = (seance.types_seances as { nom: string })?.nom || 'Type inconnu';
            sessionsNonPlacees.push(`${typeSeance}: ${nomCours}`);
            console.log(`Impossible de placer la séance: ${nomCours} - ${typeSeance}`);
            
            // Debug: Vérifier les contraintes
            const sallesAdequates = sallesNormales.filter(s => s.capacite && s.capacite >= 30);
            console.log(`Salles normales avec capacité ≥30: ${sallesAdequates.map(s => s.nom).join(', ')}`);
            console.log(`Total salles normales disponibles: ${sallesNormales.length}`);
            
            if (seance.enseignant_id) {
                const enseignant = seances.find(s => s.id === seance.id)?.enseignants as { nom: string };
                console.log(`Enseignant: ${enseignant?.nom || 'Non assigné'}`);
            }
            
            const groupe = groupes.find(g => g.id === seance.groupe_id);
            console.log(`Groupe: ${groupe?.nom || 'Inconnu'}`);
        }
    }

    // --- Étape 6: Sauvegarde du résultat ---
    setMessage('6/6 - Sauvegarde du nouvel emploi du temps...');
    
    // a. Supprimer les anciennes entrées de l'emploi du temps pour cette section
    const { error: deleteError } = await supabase
        .from('emplois_du_temps')
        .delete()
        .in('seance_id', seances.map(s => s.id));

    if (deleteError) {
        setMessage(`Erreur lors du nettoyage de l'ancien planning: ${deleteError.message}`);
        return false;
    }

    // b. Insérer le nouveau planning
    const { error: insertError } = await supabase.from('emplois_du_temps').insert(planning);
    if (insertError) {
        setMessage(`Erreur lors de la sauvegarde du nouveau planning: ${insertError.message}`);
        return false;
    }

    // c. Afficher le rapport final
    const seancesPlacees = planning.length;
    const seancesTotales = seances.length;
    
    let messageFinal = `Génération terminée ! ${seancesPlacees}/${seancesTotales} séances placées.`;
    messageFinal += `\n\nLogique de placement:`;
    messageFinal += `\n• CM → Amphis (${amphis.length} disponibles)`;
    messageFinal += `\n• TD/TP → Salles normales (${sallesNormales.length} disponibles)`;
    
    if (sessionsNonPlacees.length > 0) {
        messageFinal += `\n\nSessions non placées:\n${sessionsNonPlacees.join('\n')}`;
        messageFinal += '\n\nCauses possibles:';
        messageFinal += '\n• Conflits d\'enseignants';
        messageFinal += '\n• Salles insuffisantes ou occupées';
        messageFinal += '\n• Créneaux horaires saturés';
        messageFinal += '\n• Contraintes de partage de salles';
        messageFinal += '\n• Manque d\'amphis pour les CM';
        messageFinal += '\n• Manque de salles normales pour les TD/TP';
    }
    
    setMessage(messageFinal);
    return true;
}

// Fonction pour vérifier la cohérence des données
export async function verifierCohérence(): Promise<string> {
    let rapport = '=== VÉRIFICATION DE LA COHÉRENCE ===\n\n';
    
    try {
        // 1. Lister toutes les sections
        const { data: sections, error: sectionsError } = await supabase
            .from('sections')
            .select('id, nom')
            .order('nom');
        
        if (sectionsError) {
            rapport += `❌ Erreur sections: ${sectionsError.message}\n`;
            return rapport;
        }
        
        rapport += `📊 Sections existantes (${sections?.length || 0}):\n`;
        sections?.forEach(s => {
            rapport += `  - ${s.nom} (ID: ${s.id})\n`;
        });
        rapport += '\n';
        
        // 2. Lister tous les groupes
        const { data: groupes, error: groupesError } = await supabase
            .from('groupes')
            .select('id, nom, section_id')
            .order('nom');
        
        if (groupesError) {
            rapport += `❌ Erreur groupes: ${groupesError.message}\n`;
            return rapport;
        }
        
        rapport += `📊 Groupes existants (${groupes?.length || 0}):\n`;
        groupes?.forEach(g => {
            const section = sections?.find(s => s.id === g.section_id);
            rapport += `  - ${g.nom} → Section: ${section?.nom || 'INCONNUE'} (${g.section_id})\n`;
        });
        rapport += '\n';
        
        // 3. Identifier les problèmes
        rapport += '🔍 PROBLÈMES IDENTIFIÉS:\n';
        let problemes = 0;
        
        groupes?.forEach(g => {
            const section = sections?.find(s => s.id === g.section_id);
            if (!section) {
                rapport += `❌ Groupe "${g.nom}" → Section ID ${g.section_id} n'existe pas\n`;
                problemes++;
            }
        });
        
        if (problemes === 0) {
            rapport += '✅ Aucun problème de cohérence détecté\n';
        } else {
            rapport += `\n💡 SOLUTIONS:\n`;
            rapport += `1. Vérifiez que toutes les sections existent\n`;
            rapport += `2. Supprimez ou corrigez les groupes orphelins\n`;
        }
        
    } catch (error) {
        rapport += `❌ Erreur générale: ${error}\n`;
    }
    
    return rapport;
}
