SUBDIR( map )
SUBDIR( resource )
SUBDIR( rules )
SUBDIR( settings )
SUBDIR( slot )
SUBDIR( connection )
SUBDIR( faction )
SUBDIR( animation )
SUBDIR( unit )
SUBDIR( base )
SUBDIR( event )
SUBDIR( turn )
SUBDIR( technology )

SET( SRC ${SRC}

	${PWD}/Random.cpp
	${PWD}/Bindings.cpp
	${PWD}/State.cpp
	${PWD}/Game.cpp
	${PWD}/GameOpening.cpp
	${PWD}/GameColony.cpp
	${PWD}/GameUnitDisband.cpp
	${PWD}/GameResearch.cpp
	${PWD}/Account.cpp
	${PWD}/Player.cpp
	${PWD}/MapObject.cpp
	${PWD}/ResourceRelated.cpp

	PARENT_SCOPE )
