/*
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

const Resource = require('./model/resource');
const Globalize = require('./globalize');
const JSONGenerator = require('./serializer/jsongenerator');
const JSONPopulator = require('./serializer/jsonpopulator');
const ResourceValidator = require('./serializer/resourcevalidator');
const TypedStack = require('./serializer/typedstack');
const JSONWriter = require('./codegen/jsonwriter');

/**
 * Serialize Resources instances to/from various formats for long-term storage
 * (e.g. on the blockchain).
 * <p><a href="./diagrams/serializer.svg"><img src="./diagrams/serializer.svg" style="height:100%;"/></a></p>
 * @class
 * @memberof module:composer-common
 */
class Serializer {
    /**
     * Create a Serializer.
     * <strong>Note: Only to be called by framework code. Applications should
     * retrieve instances from {@link Composer}</strong>
     * </p>
     * @param {Factory} factory - The Factory to use to create instances
     * @param {ModelManager} modelManager - The ModelManager to use for validation etc.
     */
    constructor(factory,modelManager) {

        if(!factory) {
            throw new Error(Globalize.formatMessage('serializer-constructor-factorynull'));
        } else if(!modelManager) {
            throw new Error(Globalize.formatMessage('serializer-constructor-modelmanagernull'));
        }

        this.factory = factory;
        this.modelManager = modelManager;
    }

    /**
     * <p>
     * Convert a {@link Resource} to a JavaScript object suitable for long-term
     * peristent storage.
     * </p>
     * @param {Resource} resource - The instance to convert to JSON
     * @param {Object} options - the optional serialization options.
     * @param {boolean} options.validate - validate the structure of the Resource
     * with its model prior to serialization (default to true)
     * @param {boolean} options.convertResourcesToRelationships - Convert resources that
     * are specified for relationship fields into relationships, false by default.
     * @param {boolean} options.permitResourcesForRelationships - Permit resources in the
     * place of relationships (serializing them as resources), false by default.
     * @return {Object} - The Javascript Object that represents the resource
     * @throws {Error} - throws an exception if resource is not an instance of
     * Resource or fails validation.
     */
    toJSON(resource, options) {
        // correct instance type
        if(!(resource instanceof Resource)) {
            throw new Error(Globalize.formatMessage('serializer-tojson-notcobject'));
        }

        const parameters = {};
        parameters.stack = new TypedStack(resource);
        parameters.modelManager = this.modelManager;
        parameters.seenResources = new Set();
        const classDeclaration = this.modelManager.getType( resource.getFullyQualifiedType() );
        if(!classDeclaration) {
            throw new Error( 'Failed to find type ' + resource.getFullyQualifiedType() + ' in ModelManager.' );
        }

        // validate the resource against the model
        options = options || { validate: true };
        if(options.validate === true) {
            const validator = new ResourceValidator();
            classDeclaration.accept(validator, parameters);
        }

        const generator = new JSONGenerator(
            options.convertResourcesToRelationships === true,
            options.permitResourcesForRelationships === true
        );
        const writer = new JSONWriter();
        parameters.writer = writer;
        parameters.stack.clear();
        parameters.stack.push(resource);

        // this writes the JSON into the parameters.writer
        classDeclaration.accept(generator, parameters);
        const jsonText = parameters.writer.getBuffer();

        try {
            return JSON.parse(jsonText);
        }
        catch(err) {
            throw new Error( 'Generated invalid JSON: ' + jsonText );
        }
    }

    /**
     * Create a {@link Resource} from a JavaScript Object representation.
     * The JavaScript Object should have been created by calling the
     * {@link Serializer#toJSON toJSON} API.
     *
     * The Resource is populated based on the JavaScript object.
     *
     * @param {Object} jsonObject The JavaScript Object for a Resource
     * @param {Object} options - the optional serialization options
     * @param {boolean} options.acceptResourcesForRelationships - handle JSON objects
     * in the place of strings for relationships, defaults to false.
     * @return {Resource} The new populated resource
     */
    fromJSON(jsonObject, options) {

        if(!jsonObject.$class) {
            throw new Error('Invalid JSON data. Does not contain a $class type identifier.');
        }

        const classDeclaration = this.modelManager.getType(jsonObject.$class);
        if(!classDeclaration) {
            throw new Error( 'Failed to find type ' + jsonObject.$class + ' in ModelManager.' );
        }

        // default the options.
        options = options || {};

        // create a new instance, using the identifier field name as the ID.
        let resource = this.factory.newResource( classDeclaration.getModelFile().getNamespace(),
          classDeclaration.getName(), jsonObject[classDeclaration.getIdentifierFieldName()] );

        // populate the resource based on the jsonObject
        // by walking the classDeclaration
        const parameters = {};
        parameters.jsonStack = new TypedStack(jsonObject);
        parameters.resourceStack = new TypedStack(resource);
        parameters.modelManager = this.modelManager;
        parameters.factory = this.factory;
        const populator = new JSONPopulator(options.acceptResourcesForRelationships === true);
        classDeclaration.accept(populator, parameters);
        return resource;
    }
}

module.exports = Serializer;
