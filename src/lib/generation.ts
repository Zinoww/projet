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
        
        // 3. Compter les séances totales
        const { count: nbSeances, error: seancesError } = await supabase
            .from('seances')
            .select('*', { count: 'exact', head: true });
        
        if (seancesError) {
            rapport += `❌ Erreur séances: ${seancesError.message}\n`;
            return rapport;
        }
        
        rapport += `📊 Total des séances: ${nbSeances || 0}\n\n`;
        
        // 4. Test simple de la requête avec relations
        const { data: testSeances, error: testError } = await supabase
            .from('seances')
            .select('id, groupe_id, groupes!inner(id)')
            .eq('groupes.section_id', sectionId)
            .limit(5);
        
        if (testError) {
            rapport += `❌ Erreur requête relations: ${testError.message}\n`;
            rapport += `💡 Le problème vient probablement de la relation groupes\n`;
        } else {
            rapport += `✅ Requête relations OK\n`;
            rapport += `📊 Séances trouvées avec relations: ${testSeances?.length || 0}\n`;
        }
        
        rapport += '\n=== RECOMMANDATIONS ===\n';
        if (nbGroupes === 0) {
            rapport += '1. Créez des groupes pour cette section\n';
        }
        if (nbSeances === 0) {
            rapport += '2. Créez des séances\n';
        }
        if (testError) {
            rapport += '3. Vérifiez que les séances ont des groupe_id valides\n';
        }
        
    } catch (error) {
        rapport += `❌ Erreur générale: ${error}\n`;
    }
    
    return rapport;
}

// --- 3. CORE GENERATION LOGIC ---

export async function genererEmploiDuTemps(
    sectionId: string, 
    setMessage: (msg: string) => void
): Promise<boolean> {
    // --- Étape 1: Récupération des données ---
    setMessage('1/5 - Récupération des données...');

    // a. Récupérer toutes les séances
    const { data: seances, error: seancesError } = await supabase
        .from('seances')
        .select('*');

    if (seancesError || !seances || seances.length === 0) {
        setMessage(`Erreur ou aucune séance à planifier pour cette section. ${seancesError?.message || ''}`);
        return false;
    }

    // b. Récupérer tous les groupes de la section
    const { data: groupes, error: groupesError } = await supabase
        .from('groupes')
        .select('id, nom, section_id')
        .eq('section_id', sectionId);

    if (groupesError || !groupes || groupes.length === 0) {
        setMessage('Aucun groupe trouvé pour cette section.');
        return false;
    }

    const groupeIds = groupes.map(g => g.id);

    // Filtrer les séances qui appartiennent à ces groupes
    const seancesValides = seances.filter(s => groupeIds.includes(s.groupe_id));

    if (seancesValides.length === 0) {
        setMessage('Aucune séance valide trouvée pour cette section. Vérifiez que les séances ont des groupes associés.');
        return false;
    }

    // c. Récupérer toutes les salles
    const { data: salles, error: sallesError } = await supabase.from('salles').select('id, nom, capacite');
    if (sallesError || !salles || salles.length === 0) {
        setMessage(`Erreur ou aucune salle disponible. ${sallesError?.message || ''}`);
        return false;
    }

    // --- Étape 2: Initialisation ---
    setMessage('2/5 - Initialisation du planning...');
    const jours = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi'];
    const creneaux: Creneau[] = [
        { debut: '08:00:00', fin: '09:30:00' },
        { debut: '09:30:00', fin: '11:00:00' },
        { debut: '11:00:00', fin: '12:30:00' },
        { debut: '13:30:00', fin: '15:00:00' },
        { debut: '15:00:00', fin: '16:30:00' }
    ];

    const planning: EmploiDuTempsItem[] = [];
    const seancesAPlacer = shuffle(seancesValides as Seance[]);

    // --- Fonction de validation ---
    const estValide = (seance: Seance, jour: string, creneau: Creneau, salle: Salle): boolean => {
        // Contrainte 1: Le groupe de la séance est-il déjà occupé ?
        const groupeOccupe = planning.some(p => {
            const seancePlanifiee = seancesAPlacer.find(s => s.id === p.seance_id);
            return seancePlanifiee?.groupe_id === seance.groupe_id && p.jour === jour && p.heure_debut === creneau.debut;
        });
        if (groupeOccupe) return false;

        // Contrainte 2: L'enseignant est-il déjà occupé ?
        if (seance.enseignant_id) {
            const enseignantOccupe = planning.some(p => {
                const seancePlanifiee = seancesAPlacer.find(s => s.id === p.seance_id);
                return seancePlanifiee?.enseignant_id === seance.enseignant_id && p.jour === jour && p.heure_debut === creneau.debut;
            });
            if (enseignantOccupe) return false;
        }

        // Contrainte 3: La salle est-elle déjà occupée ?
        const salleOccupee = planning.some(p => p.salle_id === salle.id && p.jour === jour && p.heure_debut === creneau.debut);
        if (salleOccupee) return false;
        
        // TODO: Ajouter la vérification des disponibilités JSON de l'enseignant
        // TODO: Ajouter la vérification de la capacité de la salle

        return true;
    }

    // --- Étape 3: Algorithme de Backtracking ---
    setMessage('3/5 - Recherche d\'une solution...');
    const solve = (seanceIndex: number): boolean => {
        if (seanceIndex >= seancesAPlacer.length) {
            return true; // Toutes les séances sont placées
        }

        const seanceActuelle = seancesAPlacer[seanceIndex];

        for (const jour of shuffle(jours)) {
            for (const creneau of shuffle(creneaux)) {
                for (const salle of shuffle(salles)) {
                    if (estValide(seanceActuelle, jour, creneau, salle)) {
                        planning.push({
                            seance_id: seanceActuelle.id,
                            jour: jour,
                            heure_debut: creneau.debut,
                            heure_fin: creneau.fin,
                            salle_id: salle.id
                        });

                        if (solve(seanceIndex + 1)) {
                            return true; // Solution trouvée
                        }

                        planning.pop(); // Backtrack
                    }
                }
            }
        }

        return false; // Aucune solution trouvée pour cette branche
    }

    const success = solve(0);

    if (!success) {
        setMessage('Échec : Impossible de générer un emploi du temps avec les contraintes actuelles.');
        return false;
    }

    // --- Étape 4: Sauvegarde du résultat ---
    setMessage('4/5 - Sauvegarde du nouvel emploi du temps...');
    
    // a. Récupérer les ID des anciennes séances pour ces groupes
    const { data: oldSeances, error: oldSeancesError } = await supabase
        .from('seances')
        .select('id')
        .in('groupe_id', groupeIds);

    if (oldSeancesError) {
        setMessage(`Erreur lors de la récupération des anciennes séances: ${oldSeancesError.message}`);
        return false;
    }

    // b. Supprimer les anciennes entrées de l'emploi du temps
    const oldSeanceIds = oldSeances.map(s => s.id);
    if (oldSeanceIds.length > 0) {
        const { error: deleteError } = await supabase
            .from('emplois_du_temps')
            .delete()
            .in('seance_id', oldSeanceIds);

        if (deleteError) {
            setMessage(`Erreur lors du nettoyage de l'ancien planning: ${deleteError.message}`);
            return false;
        }
    }

    // c. Insérer le nouveau planning
    const { error: insertError } = await supabase.from('emplois_du_temps').insert(planning);
    if (insertError) {
        setMessage(`Erreur lors de la sauvegarde du nouveau planning: ${insertError.message}`);
        return false;
    }

    setMessage('5/5 - Génération terminée avec succès !');
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
export async function diagnostiquerSeances(sectionId: string): Promise<string> {
    let rapport = '=== DIAGNOSTIC DÉTAILLÉ DES SÉANCES ===\n\n';
    
    try {
        // 1. Récupérer la section
        const { data: section, error: sectionError } = await supabase
            .from('sections')
            .select('*')
            .eq('id', sectionId)
            .single();
        
        if (sectionError || !section) {
            rapport += `❌ Section non trouvée\n`;
            return rapport;
        }
        
        rapport += `📚 Section: ${section.nom}\n\n`;
        
        // 2. Récupérer tous les groupes de cette section
        const { data: groupes, error: groupesError } = await supabase
            .from('groupes')
            .select('*')
            .eq('section_id', sectionId);
        
        if (groupesError) {
            rapport += `❌ Erreur groupes: ${groupesError.message}\n`;
            return rapport;
        }
        
        rapport += `👥 Groupes de cette section (${groupes?.length || 0}):\n`;
        if (groupes && groupes.length > 0) {
            groupes.forEach(g => {
                rapport += `  - ${g.nom} (ID: ${g.id})\n`;
            });
        } else {
            rapport += `  ❌ Aucun groupe trouvé pour cette section\n`;
        }
        rapport += '\n';
        
        // 3. Récupérer toutes les séances
        const { data: seances, error: seancesError } = await supabase
            .from('seances')
            .select('*')
            .order('id');
        
        if (seancesError) {
            rapport += `❌ Erreur séances: ${seancesError.message}\n`;
            return rapport;
        }
        
        rapport += `⏰ Total des séances dans la base: ${seances?.length || 0}\n\n`;
        
        if (seances && seances.length > 0) {
            rapport += '📋 Détail des séances:\n';
            seances.forEach(s => {
                const groupe = groupes?.find(g => g.id === s.groupe_id);
                rapport += `  - Séance ${s.id}: groupe_id=${s.groupe_id} → ${groupe ? groupe.nom : 'GROUPE INCONNU'}\n`;
            });
            rapport += '\n';
        }
        
        // 4. Identifier les séances pour cette section
        if (groupes && groupes.length > 0 && seances && seances.length > 0) {
            const groupeIds = groupes.map(g => g.id);
            const seancesPourSection = seances.filter(s => groupeIds.includes(s.groupe_id));
            
            rapport += `🎯 Séances pour cette section: ${seancesPourSection.length}\n`;
            
            if (seancesPourSection.length > 0) {
                rapport += 'Détail:\n';
                seancesPourSection.forEach(s => {
                    const groupe = groupes.find(g => g.id === s.groupe_id);
                    rapport += `  - Séance ${s.id} → Groupe: ${groupe?.nom} (${s.groupe_id})\n`;
                });
            } else {
                rapport += '❌ Aucune séance trouvée pour les groupes de cette section\n';
            }
            rapport += '\n';
        }
        
        // 5. Identifier les séances orphelines
        if (seances && seances.length > 0) {
            const seancesOrphelines = seances.filter(s => !groupes?.find(g => g.id === s.groupe_id));
            rapport += `⚠️ Séances orphelines (groupe inexistant): ${seancesOrphelines.length}\n`;
            
            if (seancesOrphelines.length > 0) {
                rapport += 'Séances concernées:\n';
                seancesOrphelines.forEach(s => {
                    rapport += `  - Séance ${s.id}: groupe_id=${s.groupe_id} (groupe inexistant)\n`;
                });
            }
            rapport += '\n';
        }
        
        // 6. Recommandations
        rapport += '💡 RECOMMANDATIONS:\n';
        if (!groupes || groupes.length === 0) {
            rapport += '1. Créez des groupes pour la section "Licence 1 Informatique"\n';
        }
        if (seances && seances.length > 0) {
            const seancesPourSection = seances.filter(s => groupes?.find(g => g.id === s.groupe_id));
            if (seancesPourSection.length === 0) {
                rapport += '2. Créez des séances pour les groupes de cette section\n';
                rapport += '3. Ou corrigez les groupe_id des séances existantes\n';
            }
        }
        
    } catch (error) {
        rapport += `❌ Erreur générale: ${error}\n`;
    }
    
    return rapport;
}