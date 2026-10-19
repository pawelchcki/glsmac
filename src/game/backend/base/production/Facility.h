#pragma once

#include "Production.h"

namespace game {
namespace backend {
namespace base {

class FacilityDef;

namespace production {

class Facility : public Production {
public:
	Facility( const FacilityDef* const def );
	Facility( const std::string& facility_id );
	virtual ~Facility() = default;
	const std::string& GetFacilityId() const { return m_facility_id; }

private:
	friend class Production;
	static const Production* const DeserializeImpl( types::Buffer& buf );

protected:
	void SerializeImpl( types::Buffer& buf ) const override;

private:
	const std::string m_facility_id;

};

}
}
}
}
