#include "Unit.h"

#include "game/frontend/Game.h"
#include "game/frontend/tile/Tile.h"
#include "util/String.h"
#include "game/backend/unit/Unit.h"
#include "game/frontend/Slot.h"
#include "UnitDef.h"
#include "BadgeDefs.h"
#include "SlotBadges.h"
#include "UnitManager.h"
#include "game/frontend/sprite/InstancedSprite.h"
#include "scene/actor/Instanced.h"
#include "types/mesh/Rectangle.h"
#include "scene/actor/Sprite.h"
#include "types/texture/Texture.h"

namespace game {
namespace frontend {
namespace unit {

Unit::Unit(
	UnitManager* um,
	BadgeDefs* badge_defs,
	const size_t id,
	UnitDef* def,
	Slot* slot,
	tile::Tile* tile,
	const types::Vec3& render_coords,
	const bool is_owned,
	const backend::unit::movement_t movement,
	const backend::unit::morale_t morale,
	const std::string& morale_string,
	const backend::unit::health_t health,
	const backend::unit::order_t order
)
	: TileObject( TOT_UNIT, tile )
	, m_um( um )
	, m_badge_defs( badge_defs )
	, m_id( id )
	, m_def( def )
	, m_slot_badges( m_um->GetSlotBadges( slot->GetIndex() ) )
	, m_render(
		{
			render_coords,
			false,
			0,
			{},
			{}
		}
	)
	, m_is_owned( is_owned )
	, m_movement( movement )
	, m_morale( morale )
	, m_morale_string( morale_string )
	, m_health( health )
	, m_order( order ) {
	m_is_active = ShouldBeActive();
	m_render.badge.def = m_slot_badges->GetUnitBadgeSprite( m_morale, m_is_active );
	m_render.badge.healthbar.def = m_badge_defs->GetBadgeHealthbarSprite( m_health );
	UpdateMeshTex( m_render_data.unit, GetSprite()->instanced_sprite );
	UpdateMeshTex( m_render_data.badge, GetBadgeSprite()->instanced_sprite );
	UpdateMeshTex( m_render_data.healthbar, GetBadgeHealthbarSprite()->instanced_sprite );
	m_tile->AddUnit( this );
}

Unit::~Unit() {
	Hide();
	m_tile->RemoveUnit( this );
	if ( m_render_data.unit.mesh ) {
		DELETE( m_render_data.unit.mesh );
	}
	if ( m_render_data.badge.mesh ) {
		DELETE( m_render_data.badge.mesh );
	}
	if ( m_render_data.healthbar.mesh ) {
		DELETE( m_render_data.healthbar.mesh );
	}
}

const size_t Unit::GetId() const {
	return m_id;
}

const bool Unit::IsOwned() const {
	return m_is_owned;
}

const bool Unit::IsActive() const {
	return m_is_active;
}

tile::Tile* Unit::GetTile() const {
	return m_tile;
}

const size_t Unit::GetSelectionWeight() const {
	size_t weight = 0;

	// active units have priority
	if ( m_is_active ) {
		weight += 200;
	}

	// non-artillery units have priority
	// TODO: use real unit properties
	if ( m_def->IsArtillery() ) {
		weight += 60;
	}

	// higher morale has priority
	weight += m_morale * 2;

	// health is also somewhat important
	weight += m_health * 8;

	return weight;
}

sprite::Sprite* Unit::GetSprite() const {
	return m_def->GetSprite( m_morale );
}

sprite::Sprite* Unit::GetBadgeSprite() const {
	return m_render.badge.def;
}

sprite::Sprite* Unit::GetBadgeHealthbarSprite() const {
	return m_render.badge.healthbar.def;
}

const std::string Unit::GetNameString() const {
	return m_def->GetNameString();
}

const std::string Unit::GetStatsString() const {
	return m_def->GetStatsString();
}

const std::string& Unit::GetMoraleString() const {
	return m_morale_string;
}

const std::string Unit::GetMovesString() const {
	if ( m_def->IsImmovable() ) {
		return "";
	}
	return "Moves: " + util::String::ApproximateFloat( m_movement );
}

void Unit::Iterate() {
	while ( m_render.badge.blink.timer.HasTicked() ) {
		if ( IsBadgeVisible() ) {
			HideBadge();
		}
		else {
			ShowBadge();
		}
	}
	while ( m_mover.HasTicked() ) {
		SetRenderCoords( m_mover.GetPosition() );
	}
}

void Unit::SetActiveOnTile() {
	m_tile->SetActiveUnit( this );
}

void Unit::Show() {
	if ( !m_render.is_rendered ) {
		const auto& c = m_render.coords;

		auto* sprite = m_def->GetSprite( m_morale );

		if ( !m_render.instance_id ) {
			m_render.instance_id = sprite->next_instance_id++;
		}
		sprite->instanced_sprite->actor->SetInstance(
			m_render.instance_id, {
				c.x,
				c.y,
				c.z
			}
		);

		if ( !m_render.badge.instance_id ) {
			m_render.badge.instance_id = m_render.badge.def->next_instance_id++;
		}
		if ( !m_render.badge.healthbar.instance_id ) {
			m_render.badge.healthbar.instance_id = m_render.badge.healthbar.def->next_instance_id++;
		}

		ShowBadge();

		m_render.is_rendered = true;
	}
}

void Unit::Hide() {
	if ( m_render.is_rendered ) {
		m_def->GetSprite( m_morale )->instanced_sprite->actor->RemoveInstance( m_render.instance_id );
		StopBadgeBlink( false );
		m_render.is_rendered = false;
	}
}

const bool Unit::IsBadgeVisible() const {
	return m_render.badge.def->instanced_sprite->actor->HasInstance( m_render.badge.instance_id );
}

void Unit::ShowBadge() {
	m_render.badge.def->instanced_sprite->actor->SetInstance( m_render.badge.instance_id, BadgeDefs::GetBadgeCoords( m_render.coords ) );
	m_render.badge.healthbar.def->instanced_sprite->actor->SetInstance( m_render.badge.healthbar.instance_id, BadgeDefs::GetBadgeHealthbarCoords( m_render.coords ) );
}

void Unit::HideBadge() {
	m_render.badge.def->instanced_sprite->actor->RemoveInstance( m_render.badge.instance_id );
	m_render.badge.healthbar.def->instanced_sprite->actor->RemoveInstance( m_render.badge.healthbar.instance_id );
}

void Unit::ShowFakeBadge( const uint8_t offset ) {
	if ( !m_render.fake_badge.instance_id || m_fake_badge_offset != offset ) {
		if ( m_render.fake_badge.instance_id ) {
			m_slot_badges->HideFakeBadge( !m_render.fake_badge.instance_id );
		}
		m_render.fake_badge.instance_id = m_slot_badges->ShowFakeBadge( m_render.coords, offset );
		m_fake_badge_offset = offset;
	}
}

void Unit::HideFakeBadge() {
	if ( m_render.fake_badge.instance_id ) {
		m_slot_badges->HideFakeBadge( m_render.fake_badge.instance_id );
		m_render.fake_badge.instance_id = 0;
		m_fake_badge_offset = 0;
	}
}

void Unit::StartBadgeBlink() {
	HideBadge();
	m_render.badge.blink.timer.SetInterval( m_badge_defs->GetBadgeBlinkInterval() );
}

void Unit::StopBadgeBlink( const bool is_badge_shown ) {
	m_render.badge.blink.timer.Stop();
	if ( is_badge_shown ) {
		ShowBadge();
	}
	else {
		HideBadge();
	}
}

void Unit::Refresh() {
	if ( m_need_refresh ) {
		m_need_refresh = false;
		m_is_active = ShouldBeActive();
		// Activity and health affect the priority used by selection and previews.
		m_tile->InvalidateUnitOrder();
		if ( !m_is_active ) {
			StopBadgeBlink( false );
		}
		const bool is_badge_visible = IsBadgeVisible();
		if ( is_badge_visible ) {
			HideBadge();
		}
		{
			auto* newdef = m_slot_badges->GetUnitBadgeSprite( m_morale, m_is_active );
			if ( m_render.badge.def != newdef ) {
				if ( m_render.badge.instance_id ) {
					m_render.badge.def->instanced_sprite->actor->RemoveInstance( m_render.badge.instance_id );
					m_render.badge.instance_id = 0;
				}
				m_render.badge.def = newdef;
			}
			if ( !m_render.badge.instance_id ) {
				m_render.badge.instance_id = m_render.badge.def->next_instance_id++;
			}
		}
		{
			auto* newdef = m_badge_defs->GetBadgeHealthbarSprite( m_health );
			if ( m_render.badge.healthbar.def != newdef ) {
				if ( m_render.badge.healthbar.instance_id ) {
					m_render.badge.healthbar.def->instanced_sprite->actor->RemoveInstance( m_render.badge.healthbar.instance_id );
					m_render.badge.healthbar.instance_id = 0;
				}
				m_render.badge.healthbar.def = newdef;
			}
			if ( !m_render.badge.healthbar.instance_id ) {
				m_render.badge.healthbar.instance_id = m_render.badge.healthbar.def->next_instance_id++;
			}
		}
		// TODO: cache/optimize
		UpdateMeshTex( m_render_data.unit, GetSprite()->instanced_sprite );
		UpdateMeshTex( m_render_data.badge, GetBadgeSprite()->instanced_sprite );
		UpdateMeshTex( m_render_data.healthbar, GetBadgeHealthbarSprite()->instanced_sprite );
		if ( is_badge_visible ) {
			ShowBadge();
		}
		m_um->RefreshUnit( this );
	}
}

void Unit::SetMovement( const backend::unit::movement_t movement ) {
	if ( movement != m_movement ) {
		m_movement = movement;
		m_need_refresh = true;
	}
}

void Unit::SetHealth( const backend::unit::health_t health ) {
	if ( health != m_health ) {
		m_health = health;
		m_need_refresh = true;
	}
}

const bool Unit::CanMove() const {
	return m_movement >= backend::unit::Unit::MINIMUM_MOVEMENT_TO_KEEP;
}

void Unit::SetOrder( const backend::unit::order_t order ) {
	if ( order != m_order ) { m_order = order; m_need_refresh = true; }
}

void Unit::SetTile( tile::Tile* dst_tile ) {
	ASSERT( m_tile, "source tile not set" );
	ASSERT( dst_tile, "destination tile not set" );

	m_tile->RemoveUnit( this );

	m_tile = dst_tile;

	m_tile->AddUnit( this );

	UpdateFromTile();
}

void Unit::MoveToTile( tile::Tile* dst_tile ) {
	m_mover.Stop(); //ASSERT( !m_mover.IsRunning(), "unit already moving" );
	//ASSERT( m_tile != dst_tile, "can't move to same tile" );
	ASSERT( m_tile, "source tile not set" );
	ASSERT( dst_tile, "destination tile not set" );

	StopBadgeBlink( true );
	HideFakeBadge();
	Show();

	auto from = m_tile->GetRenderData().coords.InvertY();
	auto to = dst_tile->GetRenderData().coords.InvertY();
	m_mover.Scroll( from, m_um->GetCloserCoords( to, from ), MOVE_DURATION_MS );
}

const bool Unit::IsMoving() const {
	return m_mover.IsRunning();
}

const Unit::render_data_t& Unit::GetRenderData() const {
	return m_render_data;
}

Unit::body_observation_t Unit::CopyBodyForObservation() const {
	body_observation_t out;
	out.unit_id = m_id; out.owner_badges = m_slot_badges;
	out.unit_coords = m_render.coords; out.unit_shown = m_render.is_rendered;
	out.instance_id = m_render.instance_id; out.instance_allocated = m_render.instance_id != 0;
	if ( !m_def ) { return out; }
	out.definition_id = m_def->GetIdForObservation();
	// This retained definition/morale pair is exactly the one used by Show,
	// Hide and SetRenderCoords. Never resolve a replacement by definition ID.
	const auto* sprite = m_def->GetCachedSpriteForObservation( m_morale );
	if ( !sprite || !sprite->instanced_sprite || !sprite->instanced_sprite->actor ) { return out; }
	const auto* body = sprite->instanced_sprite;
	const auto* actor = body->actor;
	if ( actor->GetType() != scene::actor::Actor::TYPE_INSTANCED_SPRITE ) { return out; }
	const auto* source = actor->GetSpriteActor();
	if ( !source ) { return out; }
	out.resource_cached = true; out.actor = actor;
	out.resource_key = body->key; out.resource_name = body->name;
	out.atlas_x = body->xy.x; out.atlas_y = body->xy.y;
	out.atlas_width = body->wh.x; out.atlas_height = body->wh.y;
	out.destination_offsets = source->GetDstOffsets();
	if ( const auto* texture = source->GetTexture() ) { out.texture_filename = texture->GetFilename(); }
	out.actor_visible = actor->IsVisible();
	out.instance_count = actor->GetInstanceCountForObservation();
	scene::actor::Instanced::instance_observation_t instance;
	if ( out.instance_allocated && actor->CopyInstanceForObservation( out.instance_id, instance ) ) {
		out.instance_present = true; out.instance_position = instance.position; out.instance_angle = instance.angle;
	}
	return out;
}

const bool Unit::ShouldBeActive() const {
	return m_is_owned && m_health >= backend::unit::Unit::MINIMUM_HEALTH_TO_KEEP && CanMove() && m_order == backend::unit::order_t::NO_ORDERS;
}

void Unit::UpdateMeshTex( meshtex_t& meshtex, const sprite::InstancedSprite* sprite ) {
	auto* texture = sprite->actor->GetSpriteActor()->GetTexture();
	NEWV( mesh, types::mesh::Rectangle );
	mesh->SetCoords(
		{
			0.0f,
			0.0f
		},
		{
			1.0f,
			1.0f
		},
		{
			sprite->xy.x,
			sprite->xy.y
		},
		{
			sprite->xy.x + sprite->wh.x,
			sprite->xy.y + sprite->wh.y
		},
		{
			texture->GetWidth(),
			texture->GetHeight()
		},
		0.8f
	);
	if ( meshtex.mesh ) {
		DELETE( meshtex.mesh );
	}
	meshtex.mesh = mesh->ToRenderMesh();
	meshtex.texture = texture;
}

void Unit::SetRenderCoords( const types::Vec3& coords ) {
	m_render.coords = coords;
	m_def->GetSprite( m_morale )->instanced_sprite->actor->UpdateInstance(
		m_render.instance_id, {
			coords.x,
			coords.y,
			coords.z
		}
	);
	m_render.badge.def->instanced_sprite->actor->UpdateInstance(
		m_render.badge.instance_id,
		BadgeDefs::GetBadgeCoords( m_render.coords )
	);
	m_render.badge.healthbar.def->instanced_sprite->actor->UpdateInstance(
		m_render.badge.healthbar.instance_id,
		BadgeDefs::GetBadgeHealthbarCoords( m_render.coords )
	);
	if ( m_render.fake_badge.instance_id ) {
		m_slot_badges->HideFakeBadge( m_render.fake_badge.instance_id );
		m_render.fake_badge.instance_id = m_slot_badges->ShowFakeBadge( m_render.coords, m_fake_badge_offset );
	}
	m_need_refresh = true;
}

}
}
}
