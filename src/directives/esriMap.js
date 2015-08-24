(function(angular) {
    'use strict';

    angular.module('esri.map').directive('esriMap', function($q, $timeout, esriRegistry) {

        return {
            // element only
            restrict: 'E',

            // isolate scope
            scope: {
                // two-way binding for center/zoom
                // because map pan/zoom can change these
                center: '=?',
                zoom: '=?',
                itemInfo: '=?',
                // one-way binding for other properties
                basemap: '@',
                // function binding for event handlers
                load: '&',
                extentChange: '&',
                // function binding for reading object hash from attribute string
                // or from scope object property
                // see Example 7 here: https://gist.github.com/CMCDragonkai/6282750
                mapOptions: '&'
            },

            // replace tag with div with same id
            compile: function($element, $attrs) {
                // remove the id attribute from the main element
                $element.removeAttr('id');

                // append a new div inside this element, this is where we will create our map
                $element.append('<div id=' + $attrs.id + '></div>');

                // since we are using compile we need to return our linker function
                // the 'link' function handles how our directive responds to changes in $scope
                /*jshint unused: false*/
                return function(scope, element, attrs, controller) {};
            },

            // directive api
            controller: function($scope, $element, $attrs) {
                // only do this once per directive
                // this deferred will be resolved with the map
                var mapDeferred = $q.defer();

                // add this map to the registry
                if ($attrs.registerAs) {
                    var deregister = esriRegistry._register($attrs.registerAs, mapDeferred);

                    // remove this from the registry when the scope is destroyed
                    $scope.$on('$destroy', deregister);
                }

                require(['esri/map', 'esri/arcgis/utils'], function(Map, arcgisUtils) {
                    // setup our mapOptions based on object hash from attribute string
                    // or from scope object property
                    var mapOptions = $scope.mapOptions() || {};

                    if ($attrs.webmapId) {
                        arcgisUtils.createMap($attrs.webmapId, $attrs.id, {
                            mapOptions: mapOptions
                        }).then(function(response) {
                            mapDeferred.resolve(response.map);

                            var geoCenter = response.map.geographicExtent.getCenter();
                            $scope.center.lng = geoCenter.x;
                            $scope.center.lat = geoCenter.y;
                            $scope.zoom = response.map.getZoom();
                            $scope.itemInfo = response.itemInfo;
                        });
                    } else {
                        // center/zoom/extent
                        // check for convenience extent attribute
                        // otherwise get from scope center/zoom
                        if ($attrs.extent) {
                            mapOptions.extent = $scope[$attrs.extent];
                        } else {
                            if ($scope.center.lng && $scope.center.lat) {
                                mapOptions.center = [$scope.center.lng, $scope.center.lat];
                            } else if ($scope.center) {
                                mapOptions.center = $scope.center;
                            }
                            if ($scope.zoom) {
                                mapOptions.zoom = $scope.zoom;
                            }
                        }

                        // $scope.basemap takes precedence over $scope.mapOptions.basemap
                        if ($scope.basemap) {
                            mapOptions.basemap = $scope.basemap;
                        }

                        // initialize map and resolve the deferred
                        var map = new Map($attrs.id, mapOptions);
                        mapDeferred.resolve(map);
                    }

                    mapDeferred.promise.then(function(map) {
                        // make a reference to the map object available
                        // to the controller once it is loaded.
                        map.on('load', function() {
                            if (!$attrs.load) {
                                return;
                            }
                            $scope.$apply(function() {
                                $scope.load()(map);
                            });
                        });

                        // listen for changes to scope and update map
                        $scope.$watch('basemap', function(newBasemap, oldBasemap) {
                            if (map.loaded && newBasemap !== oldBasemap) {
                                map.setBasemap(newBasemap);
                            }
                        });

                        $scope.inUpdateCycle = false;

                        $scope.$watch(function(scope) {
                                return [scope.center.lng, scope.center.lat, scope.zoom].join(',');
                            }, function(newCenterZoom, oldCenterZoom)
                            // $scope.$watchGroup(['center.lng','center.lat', 'zoom'], function(newCenterZoom,oldCenterZoom) // supported starting at Angular 1.3
                            {
                                if ($scope.inUpdateCycle) {
                                    return;
                                }

                                console.log('center/zoom changed', newCenterZoom, oldCenterZoom);
                                newCenterZoom = newCenterZoom.split(',');
                                if (newCenterZoom[0] !== '' && newCenterZoom[1] !== '' && newCenterZoom[2] !== '') {
                                    $scope.inUpdateCycle = true; // prevent circular updates between $watch and $apply
                                    map.centerAndZoom([newCenterZoom[0], newCenterZoom[1]], newCenterZoom[2]).then(function() {
                                        console.log('after centerAndZoom()');
                                        $scope.inUpdateCycle = false;
                                    });
                                }
                            });

                        map.on('extent-change', function(e) {
                            if ($scope.inUpdateCycle) {
                                return;
                            }

                            $scope.inUpdateCycle = true; // prevent circular updates between $watch and $apply

                            console.log('extent-change geo', map.geographicExtent);

                            $scope.$apply(function() {
                                var geoCenter = map.geographicExtent.getCenter();

                                $scope.center.lng = geoCenter.x;
                                $scope.center.lat = geoCenter.y;
                                $scope.zoom = map.getZoom();

                                // we might want to execute event handler even if $scope.inUpdateCycle is true
                                if ($attrs.extentChange) {
                                    $scope.extentChange()(e);
                                }

                                $timeout(function() {
                                    // this will be executed after the $digest cycle
                                    console.log('after apply()');
                                    $scope.inUpdateCycle = false;
                                }, 0);
                            });
                        });

                        // clean up
                        $scope.$on('$destroy', function() {
                            map.destroy();
                            // TODO: anything else?
                        });
                    });
                });

                // method returns the promise that will be resolved with the map
                this.getMap = function() {
                    return mapDeferred.promise;
                };

                // adds the layer, returns the promise that will be resolved with the result of map.addLayer
                this.addLayer = function(layer) {
                    return this.getMap().then(function(map) {
                        return map.addLayer(layer);
                    });
                };

                // array to store layer info, needed for legend
                // TODO: is this the right place for this?
                // can it be done on the legend directive itself?
                this.addLayerInfo = function(lyrInfo) {
                    if (!this.layerInfos) {
                        this.layerInfos = [lyrInfo];
                    } else {
                        this.layerInfos.push(lyrInfo);
                    }
                };
                this.getLayerInfos = function() {
                    return this.layerInfos;
                };
            }
        };
    });

})(angular);