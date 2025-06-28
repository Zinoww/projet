import { supabase } from '@/src/lib/supabaseClient'

// --- 1. TYPE DEFINITIONS ---

interface Seance {
    id: string;
    duree_minutes: number;
    cours_id: string;
    type_id: string;
    groupe_id: string;
    enseignant_id: string | null;
    // Relations
    enseignants: { id: string, nom: string, disponibilites: any }[] | null;
    groupes: { id: string, nom: string, section_id: string }[];
}

interface Salle {
    id: string;
    nom: string;
    capacite: number | null;
}

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

// Ajout d'une fonction utilitaire pour vérifier la présence d'une entité
function assertDefined<T>(value: T | undefined | null, message: string): T {
  if (value === undefined || value === null) {
    throw new Error(message);
  }
  return value;
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
                seancesDetails?.forEach((seance: any) => {
                    const type = (seance.types_seances?.nom || 'Inconnu');
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

    // b. Récupérer toutes les séances de ces groupes
    let seancesQuery = supabase
        .from('seances')
        .select('*, cours(nom, niveau), types_seances(nom), enseignants(nom)')
        .in('groupe_id', groupeIds);

    // Si un niveau est spécifié, filtrer par le niveau des cours
    if (niveau) {
        seancesQuery = seancesQuery.eq('cours.niveau', niveau);
        setMessage(`1/6 - Récupération des données pour le niveau ${niveau}...`);
    }

    const { data: seances, error: seancesError } = await seancesQuery;

    if (seancesError || !seances || seances.length === 0) {
        const message = niveau ? 
            `Erreur ou aucune séance à planifier pour cette section au niveau ${niveau}. ${seancesError?.message || ''}` :
            `Erreur ou aucune séance à planifier pour cette section. ${seancesError?.message || ''}`;
        setMessage(message);
        return false;
    }

    // c. Récupérer toutes les salles
    const { data: salles, error: sallesError } = await supabase.from('salles').select('id, nom, capacite');
    if (sallesError || !salles || salles.length === 0) {
        setMessage(`Erreur ou aucune salle disponible. ${sallesError?.message || ''}`);
        return false;
    }

    // --- Étape 2: Organisation des séances par type ---
    setMessage('2/6 - Organisation des séances par type...');

    // Séparer les séances par type
    const seancesCM = seances.filter(s => (s.types_seances as any)?.nom?.toLowerCase().includes('cm'));
    const seancesTD = seances.filter(s => (s.types_seances as any)?.nom?.toLowerCase().includes('td'));
    const seancesTP = seances.filter(s => (s.types_seances as any)?.nom?.toLowerCase().includes('tp'));

    console.log(`Séances trouvées: ${seancesCM.length} CM, ${seancesTD.length} TD, ${seancesTP.length} TP`);

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
                const salleCM = salles.find(s => s.capacite && s.capacite >= groupes.length * 30); // Estimation 30 étudiants par groupe
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
            setMessage(`Impossible de placer le CM: ${(seanceCM.cours as any)?.nom}`);
            return false;
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
                const salle = salles.find(s => s.capacite && s.capacite >= 30); // Capacité pour un groupe
                if (!salle) continue;

                // Vérifier si la salle est libre ou peut être partagée
                const seancesDansSalle = planning.filter(p => 
                    p.salle_id === salle.id && p.jour === jour && p.heure_debut === creneau.debut
                );

                if (seancesDansSalle.length > 0) {
                    // Vérifier si on peut partager la salle (même type de séance)
                    const seanceExistante = seances.find(s => s.id === seancesDansSalle[0].seance_id);
                    const memeType = (seance.types_seances as any)?.nom === (seanceExistante?.types_seances as any)?.nom;
                    
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
            setMessage(`Impossible de placer la séance: ${(seance.cours as any)?.nom} - ${(seance.types_seances as any)?.nom}`);
            return false;
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

    setMessage('Génération terminée avec succès !');
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
            rapport += `2. Corrigez les section_id des groupes orphelins\n`;
            rapport += `3. Ou supprimez les groupes sans section valide\n`;
        }
        
    } catch (error) {
        rapport += `❌ Erreur générale: ${error}\n`;
    }
    
    return rapport;
}

// Fonction pour valider les données d'import Excel
export async function validerDonneesImport(donnees: any[]): Promise<{ valide: boolean; erreurs: string[]; donneesValides: any[] }> {
    const erreurs: string[] = [];
    const donneesValides: any[] = [];
    
    try {
        // Récupérer toutes les données de référence
        const { data: cours, error: coursError } = await supabase.from('cours').select('id, nom');
        const { data: types, error: typesError } = await supabase.from('types_seances').select('id, nom');
        const { data: groupes, error: groupesError } = await supabase.from('groupes').select('id, nom');
        const { data: enseignants, error: enseignantsError } = await supabase.from('enseignants').select('id, nom');
        
        if (coursError) erreurs.push(`Erreur cours: ${coursError.message}`);
        if (typesError) erreurs.push(`Erreur types: ${typesError.message}`);
        if (groupesError) erreurs.push(`Erreur groupes: ${groupesError.message}`);
        if (enseignantsError) erreurs.push(`Erreur enseignants: ${enseignantsError.message}`);
        
        // Traiter chaque ligne
        donnees.forEach((ligne, index) => {
            const numeroLigne = index + 2; // +2 car Excel commence à 1 et on a un header
            const erreursLigne: string[] = [];
            
            // Vérifier le cours
            const coursTrouve = cours?.find(c => c.nom.toLowerCase() === ligne.cours?.toLowerCase());
            if (!coursTrouve) {
                erreursLigne.push(`Cours "${ligne.cours}" non trouvé`);
            }
            
            // Vérifier le type
            const typeTrouve = types?.find(t => t.nom.toLowerCase() === ligne.type?.toLowerCase());
            if (!typeTrouve) {
                erreursLigne.push(`Type "${ligne.type}" non trouvé`);
            }
            
            // Vérifier le groupe
            const groupeTrouve = groupes?.find(g => g.nom.toLowerCase() === ligne.groupe?.toLowerCase());
            if (!groupeTrouve) {
                erreursLigne.push(`Groupe "${ligne.groupe}" non trouvé`);
            }
            
            // Vérifier l'enseignant (optionnel)
            let enseignantTrouve = null;
            if (ligne.enseignant) {
                enseignantTrouve = enseignants?.find(e => e.nom.toLowerCase() === ligne.enseignant.toLowerCase());
                if (!enseignantTrouve) {
                    erreursLigne.push(`Enseignant "${ligne.enseignant}" non trouvé`);
                }
            }
            
            // Vérifier la durée
            if (!ligne.duree || isNaN(ligne.duree) || ligne.duree <= 0) {
                erreursLigne.push(`Durée invalide: ${ligne.duree}`);
            }
            
            // Si pas d'erreurs, ajouter aux données valides
            if (erreursLigne.length === 0) {
                donneesValides.push({
                    ...ligne,
                    cours_id: coursTrouve?.id,
                    type_id: typeTrouve?.id,
                    groupe_id: groupeTrouve?.id,
                    enseignant_id: enseignantTrouve?.id || null
                });
            } else {
                erreurs.push(`Ligne ${numeroLigne} (${ligne.cours}): ${erreursLigne.join(', ')}`);
            }
        });
        
    } catch (error) {
        erreurs.push(`Erreur générale: ${error}`);
    }
    
    return {
        valide: erreurs.length === 0,
        erreurs,
        donneesValides
    };
}

// Fonction pour afficher les données de référence pour l'import
export async function getDonneesReference(): Promise<string> {
    let rapport = '=== DONNÉES DE RÉFÉRENCE POUR IMPORT ===\n\n';
    
    try {
        // Cours disponibles
        const { data: cours, error: coursError } = await supabase
            .from('cours')
            .select('id, nom')
            .order('nom');
        
        rapport += '📚 COURS DISPONIBLES:\n';
        if (coursError) {
            rapport += `❌ Erreur: ${coursError.message}\n`;
        } else {
            cours?.forEach(c => {
                rapport += `  - ${c.nom}\n`;
            });
        }
        rapport += '\n';
        
        // Types de séances
        const { data: types, error: typesError } = await supabase
            .from('types_seances')
            .select('id, nom')
            .order('nom');
        
        rapport += '🏷️ TYPES DE SÉANCES:\n';
        if (typesError) {
            rapport += `❌ Erreur: ${typesError.message}\n`;
        } else {
            types?.forEach(t => {
                rapport += `  - ${t.nom}\n`;
            });
        }
        rapport += '\n';
        
        // Groupes
        const { data: groupes, error: groupesError } = await supabase
            .from('groupes')
            .select('id, nom')
            .order('nom');
        
        rapport += '👥 GROUPES DISPONIBLES:\n';
        if (groupesError) {
            rapport += `❌ Erreur: ${groupesError.message}\n`;
        } else {
            groupes?.forEach(g => {
                rapport += `  - ${g.nom}\n`;
            });
        }
        rapport += '\n';
        
        // Enseignants
        const { data: enseignants, error: enseignantsError } = await supabase
            .from('enseignants')
            .select('id, nom')
            .order('nom');
        
        rapport += '👨‍🏫 ENSEIGNANTS DISPONIBLES:\n';
        if (enseignantsError) {
            rapport += `❌ Erreur: ${enseignantsError.message}\n`;
        } else {
            enseignants?.forEach(e => {
                rapport += `  - ${e.nom}\n`;
            });
        }
        rapport += '\n';
        
        rapport += '📋 FORMAT EXCEL ATTENDU:\n';
        rapport += 'Colonnes: cours | type | groupe | enseignant | duree\n';
        rapport += 'Exemple: Programmation Web | TD | L1 Info G1 | Dupont Jean | 90\n';
        
    } catch (error) {
        rapport += `❌ Erreur générale: ${error}\n`;
    }
    
    return rapport;
}

// Fonction de diagnostic détaillé pour les séances
export async function diagnostiquerSeances(groupeId: string): Promise<string> {
    let rapport = '=== DIAGNOSTIC DÉTAILLÉ DES SÉANCES ===\n\n';
    
    try {
        // 1. Récupérer le groupe
        const { data: groupe, error: groupeError } = await supabase
            .from('groupes')
            .select('*')
            .eq('id', groupeId)
            .single();
        
        if (groupeError || !groupe) {
            rapport += `❌ Groupe non trouvé\n`;
            return rapport;
        }
        
        rapport += `👥 Groupe: ${groupe.nom}\n`;
        rapport += `📊 Niveau: ${groupe.niveau || 'Non défini'}\n`;
        rapport += `📊 Spécialité: ${groupe.specialite || 'Non définie'}\n\n`;
        
        // 2. Récupérer toutes les séances de ce groupe
        const { data: seances, error: seancesError } = await supabase
            .from('seances')
            .select('*, cours(nom), types_seances(nom), enseignants(nom)')
            .eq('groupe_id', groupeId)
            .order('id');
        
        if (seancesError) {
            rapport += `❌ Erreur séances: ${seancesError.message}\n`;
            return rapport;
        }
        
        rapport += `⏰ Séances pour ce groupe: ${seances?.length || 0}\n\n`;
        
        if (seances && seances.length > 0) {
            rapport += '📋 Détail des séances:\n';
            seances.forEach((seance: any, index) => {
                rapport += `  ${index + 1}. ${seance.cours?.nom || 'Cours inconnu'} - ${seance.types_seances?.nom || 'Type inconnu'}\n`;
                rapport += `     Durée: ${seance.duree_minutes} minutes\n`;
                if (seance.enseignants?.nom) {
                    rapport += `     Enseignant: ${seance.enseignants.nom}\n`;
                } else {
                    rapport += `     Enseignant: Non assigné\n`;
                }
                rapport += '\n';
            });
        } else {
            rapport += '❌ Aucune séance trouvée pour ce groupe\n\n';
        }
        
        // 3. Vérifier les contraintes
        rapport += '🔍 VÉRIFICATION DES CONTRAINTES:\n';
        
        if (seances && seances.length > 0) {
            // Vérifier les séances sans enseignant
            const seancesSansEnseignant = seances.filter((s: any) => !s.enseignant_id);
            if (seancesSansEnseignant.length > 0) {
                rapport += `⚠️ ${seancesSansEnseignant.length} séance(s) sans enseignant assigné\n`;
            }
            
            // Vérifier les durées
            const durees = seances.map((s: any) => s.duree_minutes).filter(Boolean);
            if (durees.length > 0) {
                const dureeTotale = durees.reduce((sum, duree) => sum + duree, 0);
                rapport += `📊 Durée totale des séances: ${dureeTotale} minutes\n`;
                rapport += `📊 Durée moyenne par séance: ${Math.round(dureeTotale / durees.length)} minutes\n`;
            }
        }
        
        rapport += '\n💡 RECOMMANDATIONS:\n';
        if (!seances || seances.length === 0) {
            rapport += '1. Créez des séances pour ce groupe\n';
        }
        if (seances && seances.length > 0) {
            const seancesSansEnseignant = seances.filter((s: any) => !s.enseignant_id);
            if (seancesSansEnseignant.length > 0) {
                rapport += '2. Assignez des enseignants aux séances\n';
            }
        }
        if (!groupe.niveau) {
            rapport += '3. Définissez un niveau pour ce groupe\n';
        }
        if (!groupe.specialite) {
            rapport += '4. Définissez une spécialité pour ce groupe\n';
        }
        
    } catch (error) {
        rapport += `❌ Erreur générale: ${error}\n`;
    }
    
    return rapport;
}