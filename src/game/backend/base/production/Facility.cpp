#include "Facility.h"

#include "game/backend/base/FacilityDef.h"

namespace game {
namespace backend {
namespace base {
namespace production {

Facility::Facility( const FacilityDef* const def )
	: Production( PT_FACILITY )
	, m_facility_id( def->m_id ) {}

Facility::Facility( const std::string& facility_id )
	: Production( PT_FACILITY ), m_facility_id( facility_id ) {}

void Facility::SerializeImpl( types::Buffer& buf ) const {
	buf.WriteString( m_facility_id );
}

const Production* const Facility::DeserializeImpl( types::Buffer& buf ) {
	const auto facility_id = buf.ReadString();
	// Slot/player snapshots precede world definitions. Keep the ID and resolve
	// against the receiving game's registry when queried or selected.
	if ( facility_id.empty() ) { THROW( "empty production facility id" ); }
	return new Facility( facility_id );
}

}
}
}
}
