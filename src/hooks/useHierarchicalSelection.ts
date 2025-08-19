import { useState, useEffect } from 'react'
import { supabase } from '@/src/lib/supabaseClient'

export interface Filiere { id: string; nom: string }
export interface Section { id: string; nom: string }
export interface Groupe { id: string; nom: string }

export function useHierarchicalSelection() {
    const [filieres, setFilieres] = useState<Filiere[]>([])
    const [promotions, setPromotions] = useState<string[]>([])
    const [sections, setSections] = useState<Section[]>([])
    const [groupes, setGroupes] = useState<Groupe[]>([])

    const [selectedFiliere, setSelectedFiliere] = useState('')
    const [selectedPromotion, setSelectedPromotion] = useState('')
    const [selectedSection, setSelectedSection] = useState('')
    const [selectedGroupe, setSelectedGroupe] = useState('')

    const [loading, setLoading] = useState(false)

    // Load filieres
    useEffect(() => {
        async function loadFilieres() {
            setLoading(true)
            const { data, error } = await supabase.from('filieres').select('id, nom').order('nom')
            if (error) console.error('Error loading filieres:', error)
            else {
                setFilieres(data || [])
            }
            setLoading(false)
        }
        loadFilieres()
    }, [])

    // Load promotions when filiere changes
    useEffect(() => {
        if (!selectedFiliere) {
            setPromotions([])
            return
        }
        async function loadPromotions() {
            setLoading(true)
            
            const { data: sectionsInFiliere, error: sectionsError } = await supabase
                .from('sections')
                .select('id')
                .eq('filiere_id', selectedFiliere)

            if (sectionsError || !sectionsInFiliere || sectionsInFiliere.length === 0) {
                setPromotions([])
                setLoading(false)
                return
            }

            const sectionIds = sectionsInFiliere.map(s => s.id)
            
            const { data, error } = await supabase
                .from('groupes')
                .select('niveau')
                .in('section_id', sectionIds)
                .not('niveau', 'is', null)

            if (error) {
                setPromotions([])
            } else {
                const promotionsUniques = [...new Set(data.map(g => g.niveau).filter(Boolean) as string[])]
                setPromotions(promotionsUniques.sort())
            }
            setLoading(false)
        }

        loadPromotions()
    }, [selectedFiliere])

    // Load sections when promotion changes
    useEffect(() => {
        if (!selectedFiliere || !selectedPromotion) {
            setSections([])
            return
        }
        async function loadSections() {
            setLoading(true)

            const { data: sectionsInFiliere, error: sectionsError } = await supabase
                .from('sections')
                .select('id')
                .eq('filiere_id', selectedFiliere)

            if (sectionsError || !sectionsInFiliere || sectionsInFiliere.length === 0) {
                setSections([]);
                setLoading(false);
                return;
            }

            const sectionIdsInFiliere = sectionsInFiliere.map(s => s.id)

            const { data: groupesWithNiveau, error: groupesError } = await supabase
                .from('groupes')
                .select('section_id')
                .in('section_id', sectionIdsInFiliere)
                .eq('niveau', selectedPromotion)

            if (groupesError || !groupesWithNiveau || groupesWithNiveau.length === 0) {
                setSections([]);
                setLoading(false);
                return;
            }
            
            const relevantSectionIds = [...new Set(groupesWithNiveau.map(g => g.section_id).filter(Boolean))]

            if(relevantSectionIds.length > 0) {
                const { data: finalSections, error: finalSectionsError } = await supabase
                    .from('sections')
                    .select('id, nom')
                    .in('id', relevantSectionIds)
                    .order('nom')

                if (finalSectionsError) {
                     setSections([])
                }
                else {
                    setSections(finalSections || [])
                }
            } else {
                setSections([])
            }

            setLoading(false)
        }
        loadSections()
    }, [selectedFiliere, selectedPromotion])

    // Load groupes when section changes
    useEffect(() => {
        if (!selectedSection || !selectedPromotion) {
            setGroupes([])
            return
        }
        async function loadGroupes() {
            setLoading(true)
            const { data, error } = await supabase
                .from('groupes')
                .select('id, nom')
                .eq('section_id', selectedSection)
                .eq('niveau', selectedPromotion)
                .order('nom')
            
            if (error) {
                setGroupes([])
            }
            else {
                setGroupes(data || [])
            }
            setLoading(false)
        }
        loadGroupes()
    }, [selectedSection, selectedPromotion])

    return {
        filieres,
        promotions,
        sections,
        groupes,
        selectedFiliere,
        selectedPromotion,
        selectedSection,
        selectedGroupe,
        setSelectedFiliere,
        setSelectedPromotion,
        setSelectedSection,
        setSelectedGroupe,
        loading,
    }
} 