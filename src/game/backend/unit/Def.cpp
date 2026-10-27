#include "Def.h"

#include "StaticDef.h"

#include "MoraleSet.h"

#include "gse/value/Object.h"
#include "gse/value/String.h"
#include "gse/value/Int.h"
#include "gse/value/Bool.h"
#include <memory>

namespace game {
namespace backend {
namespace unit {

Def::Def( const std::string& id, const MoraleSet* moraleset, const def_type_t type, const std::string& name )
	: m_id( id )
	, m_moraleset( moraleset )
	, m_type( type )
	, m_name( name ) {
	//
}

bool Def::ValidCombat( const combat_t& combat ) {
	if ( combat.reactor < 1 || combat.reactor > 4 || combat.offense < 0 || combat.offense > 99 || combat.defense < 0 || combat.defense > 99 ) { return false; }
	if ( combat.kind == "psi" ) { return combat.offense == 0 && combat.defense == 0 && combat.reactor == 1; }
	if ( combat.kind == "conventional" ) { return combat.offense > 0 && combat.defense > 0; }
	if ( combat.kind == "civilian" ) { return combat.offense == 0 && combat.defense > 0; }
	return false;
}

Def::combat_t Def::ParseCombat( GSE_CALLABLE, const gse::value::object_properties_t& values ) {
	if ( values.size() != 4 ) { GSE_ERROR( gse::EC.INVALID_CALL, "Unit combat requires kind, offense, defense and reactor" ); }
	const auto kind = values.find( "kind" );
	if ( kind == values.end() || kind->second->type != gse::VT_STRING ) { GSE_ERROR( gse::EC.INVALID_CALL, "Unit combat kind must be a string" ); }
	combat_t combat;
	combat.kind = static_cast< const gse::value::String* >( kind->second )->value;
	const auto integer = [ & ]( const char* key ) {
		const auto found = values.find( key );
		if ( found == values.end() || found->second->type != gse::VT_INT ) { GSE_ERROR( gse::EC.INVALID_CALL, "Unit combat values must be integers" ); }
		const auto number = static_cast< const gse::value::Int* >( found->second )->value;
		if ( number < 0 || number > 99 ) { GSE_ERROR( gse::EC.INVALID_CALL, "Unit combat value is outside its supported range" ); }
		return int( number );
	};
	combat.offense = integer( "offense" ); combat.defense = integer( "defense" ); combat.reactor = integer( "reactor" );
	if ( !ValidCombat( combat ) ) { GSE_ERROR( gse::EC.INVALID_CALL, "Invalid unit combat attributes" ); }
	return combat;
}

void Def::SetCombat( const combat_t& combat ) {
	if ( !ValidCombat( combat ) || ( m_can_terraform && combat.kind != "civilian" ) ) { THROW( "Invalid unit combat attributes" ); }
	m_combat = combat;
}

void Def::SetCanTerraform( const bool enabled ) {
	if ( enabled && m_combat.kind != "civilian" ) { THROW( "Terraforming capability requires a civilian module" ); }
	m_can_terraform = enabled;
}

const types::Buffer Def::Serialize( const Def* def ) {
	types::Buffer buf;
	buf.WriteString( def->m_id );
	buf.WriteString( def->m_moraleset->m_id );
	buf.WriteString( def->m_name );
	buf.WriteInt( def->m_type );
	switch ( def->m_type ) {
		case DT_STATIC: {
			StaticDef::Serialize( buf, (StaticDef*)def );
			break;
		}
		default:
			THROW( "unknown def type on write: " + std::to_string( def->m_type ) );
	}
	buf.WriteString( "unit-combat-v1" );
	buf.WriteString( def->m_combat.kind );
	buf.WriteInt( def->m_combat.offense ); buf.WriteInt( def->m_combat.defense ); buf.WriteInt( def->m_combat.reactor );
	// Definitions without the capability retain their historical wire bytes.
	if ( def->m_can_terraform ) { buf.WriteString( "unit-abilities-v1" ); buf.WriteBool( true ); }
	return buf;
}

Def* Def::Deserialize( types::Buffer& buf, const UnitManager* manager ) {
	const auto id = buf.ReadString();
	const auto moraleset = buf.ReadString();
	const auto name = buf.ReadString();
	const auto type = (def_type_t)buf.ReadInt();
	std::unique_ptr< Def > def;
	switch ( type ) {
		case DT_STATIC:
			def.reset( StaticDef::Deserialize( buf, id, moraleset, name, manager ) );
			break;
		default:
			THROW( "unknown def type on read: " + std::to_string( type ) );
	}
	// Old length-delimited definitions retain their previous psi model.
	if ( buf.lenr < buf.lenw ) {
		if ( buf.ReadString() != "unit-combat-v1" ) { THROW( "Unknown unit combat extension" ); }
		combat_t combat;
		combat.kind = buf.ReadString();
		const auto offense = buf.ReadInt(); const auto defense = buf.ReadInt(); const auto reactor = buf.ReadInt();
		if ( offense < 0 || offense > 99 || defense < 0 || defense > 99 || reactor < 1 || reactor > 4 ) { THROW( "Invalid serialized unit combat attributes" ); }
		combat.offense = int( offense ); combat.defense = int( defense ); combat.reactor = int( reactor );
		def->SetCombat( combat );
	}
	if ( buf.lenr < buf.lenw ) {
		if ( buf.ReadString() != "unit-abilities-v1" ) { THROW( "Unknown unit abilities extension" ); }
		def->SetCanTerraform( buf.ReadBool() );
	}
	if ( buf.lenr != buf.lenw ) { THROW( "Trailing unit definition data" ); }
	return def.release();
}

WRAPIMPL_BEGIN( Def )
	WRAPIMPL_PROPS
			{
				"id",
				VALUE( gse::value::String, , m_id )
			},
			{
				"name",
				VALUE( gse::value::String, , m_name )
			},
			{
				"type",
				VALUE( gse::value::String, , "static" ) // TODO
			},
			{ "morale", VALUE( gse::value::String,, m_moraleset->m_id ) },
			{ "can_terraform", VALUE( gse::value::Bool,, m_can_terraform ) },
			{ "combat", VALUEEXT( gse::value::Object, GSE_CALL, {
				{ "kind", VALUE( gse::value::String,, m_combat.kind ) },
				{ "offense", VALUE( gse::value::Int,, m_combat.offense ) },
				{ "defense", VALUE( gse::value::Int,, m_combat.defense ) },
				{ "reactor", VALUE( gse::value::Int,, m_combat.reactor ) },
			} ) },
		};
WRAPIMPL_END_PTR()

UNWRAPIMPL_PTR( Def )

}
}
}
